require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'highflow-task-tracker-secret-2026';

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'task_tracker',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
      }
);

// --- Auth Middleware ---
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// --- DB Init ---
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      task_description TEXT NOT NULL,
      stakeholder VARCHAR(255),
      section VARCHAR(100),
      create_date DATE,
      initial_target_date DATE,
      revised_date_1 DATE,
      revised_date_2 DATE,
      revised_date_3 DATE,
      revised_date_4 DATE,
      revised_date_5 DATE,
      completion_date DATE,
      remarks TEXT,
      sheet_name VARCHAR(100) DEFAULT 'Unit 1',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS weekly_scores (
      id SERIAL PRIMARY KEY,
      week_number VARCHAR(50) UNIQUE,
      score_percent DECIMAL(5,2),
      recorded_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sections (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stakeholders (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'viewer',
      created_at TIMESTAMP DEFAULT NOW()
    );

    INSERT INTO sections (name) VALUES
      ('Assembly'), ('Claim'), ('Rotary'), ('Packing'), ('IT'),
      ('Plate Mfg'), ('Purchase'), ('Quality'), ('HR'),
      ('Maintenance'), ('Battery Cutting'), ('Accounts')
    ON CONFLICT (name) DO NOTHING;
  `);

  // Create default admin if no users exist
  const { rows } = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(rows[0].count) === 0) {
    const hash = await bcrypt.hash('highflow@123', 10);
    await pool.query(
      `INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,'admin')`,
      ['Sumit Jaiswal', 'sumit@highflow.in', hash]
    );
    console.log('Default admin created: sumit@highflow.in / highflow@123');
  }

  console.log('DB initialized');
}

// --- Helpers ---
function calcTask(task) {
  const revisions = [
    task.revised_date_1, task.revised_date_2, task.revised_date_3,
    task.revised_date_4, task.revised_date_5,
  ].filter(Boolean);
  const no_of_deviations = revisions.length;
  const achievement_status = task.completion_date ? 'Completed' : 'Pending';
  const score = task.initial_target_date
    ? task.completion_date ? Math.max(0, 5 - no_of_deviations) : null
    : null;
  const effective_target = revisions[revisions.length - 1] || task.initial_target_date;
  const is_overdue = achievement_status === 'Pending' && effective_target && new Date(effective_target) < new Date();
  return { ...task, no_of_deviations, achievement_status, score, is_overdue };
}

// ========================
// AUTH ROUTES (public)
// ========================

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,name,email,role,created_at FROM users WHERE id=$1', [req.user.id]);
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// USER MANAGEMENT (admin)
// ========================

app.get('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id,name,email,role,created_at FROM users ORDER BY created_at ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role,created_at`,
      [name, email.toLowerCase(), hash, role || 'viewer']
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    let q, params;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      q = `UPDATE users SET name=$1, email=$2, role=$3, password=$4 WHERE id=$5 RETURNING id,name,email,role,created_at`;
      params = [name, email.toLowerCase(), role, hash, req.params.id];
    } else {
      q = `UPDATE users SET name=$1, email=$2, role=$3 WHERE id=$4 RETURNING id,name,email,role,created_at`;
      params = [name, email.toLowerCase(), role, req.params.id];
    }
    const { rows } = await pool.query(q, params);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: "Can't delete yourself" });
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// TASKS (protected)
// ========================

app.get('/api/tasks', auth, async (req, res) => {
  try {
    const { sheet_name, section, stakeholder, status } = req.query;
    let q = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];
    if (sheet_name) { params.push(sheet_name); q += ` AND sheet_name=$${params.length}`; }
    if (section) { params.push(section); q += ` AND section=$${params.length}`; }
    if (stakeholder) { params.push(stakeholder); q += ` AND stakeholder=$${params.length}`; }
    q += ' ORDER BY id ASC';
    const result = await pool.query(q, params);
    let tasks = result.rows.map(calcTask);
    if (status) tasks = tasks.filter(t => t.achievement_status === status);
    res.json(tasks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/tasks', auth, async (req, res) => {
  try {
    const { task_description, stakeholder, section, create_date, initial_target_date,
      revised_date_1, revised_date_2, revised_date_3, revised_date_4, revised_date_5,
      completion_date, remarks, sheet_name } = req.body;
    const result = await pool.query(
      `INSERT INTO tasks (task_description, stakeholder, section, create_date, initial_target_date,
         revised_date_1, revised_date_2, revised_date_3, revised_date_4, revised_date_5,
         completion_date, remarks, sheet_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [task_description, stakeholder||null, section||null, create_date||null, initial_target_date||null,
       revised_date_1||null, revised_date_2||null, revised_date_3||null, revised_date_4||null,
       revised_date_5||null, completion_date||null, remarks||null, sheet_name||'Unit 1']
    );
    if (stakeholder) await pool.query('INSERT INTO stakeholders (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [stakeholder]);
    res.json(calcTask(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tasks/:id', auth, async (req, res) => {
  try {
    const { task_description, stakeholder, section, create_date, initial_target_date,
      revised_date_1, revised_date_2, revised_date_3, revised_date_4, revised_date_5,
      completion_date, remarks, sheet_name } = req.body;
    const result = await pool.query(
      `UPDATE tasks SET task_description=$1, stakeholder=$2, section=$3, create_date=$4,
         initial_target_date=$5, revised_date_1=$6, revised_date_2=$7, revised_date_3=$8,
         revised_date_4=$9, revised_date_5=$10, completion_date=$11, remarks=$12,
         sheet_name=$13, updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [task_description, stakeholder||null, section||null, create_date||null, initial_target_date||null,
       revised_date_1||null, revised_date_2||null, revised_date_3||null, revised_date_4||null,
       revised_date_5||null, completion_date||null, remarks||null, sheet_name||'Unit 1', req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (stakeholder) await pool.query('INSERT INTO stakeholders (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [stakeholder]);
    res.json(calcTask(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM tasks WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================
// DASHBOARD & META
// ========================

app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const { sheet_name } = req.query;
    const result = await pool.query(sheet_name ? 'SELECT * FROM tasks WHERE sheet_name=$1' : 'SELECT * FROM tasks', sheet_name ? [sheet_name] : []);
    const tasks = result.rows.map(calcTask);
    const total = tasks.length;
    const completed = tasks.filter(t => t.achievement_status === 'Completed').length;
    const pending = tasks.filter(t => t.achievement_status === 'Pending').length;
    const overdue = tasks.filter(t => t.is_overdue).length;
    const scoredTasks = tasks.filter(t => t.score !== null);
    const avgScore = scoredTasks.length ? (scoredTasks.reduce((s, t) => s + t.score, 0) / scoredTasks.length).toFixed(2) : 0;

    const shMap = {};
    tasks.forEach(t => {
      if (!t.stakeholder) return;
      if (!shMap[t.stakeholder]) shMap[t.stakeholder] = { total: 0, completed: 0, scoreSum: 0, scored: 0 };
      shMap[t.stakeholder].total++;
      if (t.achievement_status === 'Completed') shMap[t.stakeholder].completed++;
      if (t.score !== null) { shMap[t.stakeholder].scoreSum += t.score; shMap[t.stakeholder].scored++; }
    });
    const stakeholderStats = Object.entries(shMap).map(([name, d]) => ({
      name, total: d.total, completed: d.completed, pending: d.total - d.completed,
      avgScore: d.scored ? (d.scoreSum / d.scored).toFixed(2) : '-',
    })).sort((a, b) => b.total - a.total);

    const secMap = {};
    tasks.forEach(t => {
      if (!t.section) return;
      if (!secMap[t.section]) secMap[t.section] = { total: 0, completed: 0 };
      secMap[t.section].total++;
      if (t.achievement_status === 'Completed') secMap[t.section].completed++;
    });
    const sectionStats = Object.entries(secMap).map(([name, d]) => ({
      name, total: d.total, completed: d.completed, pending: d.total - d.completed,
    })).sort((a, b) => b.total - a.total);

    res.json({ total, completed, pending, overdue, avgScore, stakeholderStats, sectionStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sections', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT name FROM sections ORDER BY name');
    res.json(rows.map(r => r.name));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stakeholders', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT name FROM stakeholders ORDER BY name');
    res.json(rows.map(r => r.name));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/weekly-scores', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM weekly_scores ORDER BY id ASC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/weekly-scores', auth, async (req, res) => {
  try {
    const { week_number, score_percent } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO weekly_scores (week_number, score_percent) VALUES ($1,$2)
       ON CONFLICT (week_number) DO UPDATE SET score_percent=$2 RETURNING *`,
      [week_number, score_percent]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================
// SERVE FRONTEND (prod)
// ========================
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

const PORT = process.env.PORT || 5003;
initDB()
  .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
  .catch(err => { console.error('DB init failed:', err); process.exit(1); });
