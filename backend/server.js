require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const cron = require('node-cron');
const { sendWhatsApp, sendWhatsAppTemplate, buildMessage } = require('./whatsapp');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'highflow-task-tracker-secret-2026';

const isExternalDB = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('.render.com');
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: isExternalDB ? { rejectUnauthorized: false } : false }
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
    CREATE TABLE IF NOT EXISTS tt_tasks (
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

    CREATE TABLE IF NOT EXISTS tt_weekly_scores (
      id SERIAL PRIMARY KEY,
      week_number VARCHAR(50) UNIQUE,
      score_percent DECIMAL(5,2),
      recorded_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tt_sections (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tt_stakeholders (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      whatsapp_number VARCHAR(20)
    );

    CREATE TABLE IF NOT EXISTS tt_users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'viewer',
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE tt_stakeholders ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20);

    INSERT INTO tt_sections (name) VALUES
      ('Assembly'), ('Claim'), ('Rotary'), ('Packing'), ('IT'),
      ('Plate Mfg'), ('Purchase'), ('Quality'), ('HR'),
      ('Maintenance'), ('Battery Cutting'), ('Accounts')
    ON CONFLICT (name) DO NOTHING;
  `);

  // Create default admin if no users exist
  const { rows: userRows } = await pool.query('SELECT COUNT(*) FROM tt_users');
  if (parseInt(userRows[0].count) === 0) {
    const hash = await bcrypt.hash('highflow@123', 10);
    await pool.query(
      `INSERT INTO tt_users (name, email, password, role) VALUES ($1,$2,$3,'admin')`,
      ['Sumit Jaiswal', 'sumit@highflow.in', hash]
    );
    console.log('Default admin created: sumit@highflow.in / highflow@123');
  }

  // Seed tasks from Excel data on first run
  const { rows: taskRows } = await pool.query('SELECT COUNT(*) FROM tt_tasks');
  if (parseInt(taskRows[0].count) === 0) {
    try {
      const seedPath = path.join(__dirname, 'seeds', 'tasks.json');
      const seedData = require(seedPath);
      for (const t of seedData) {
        await pool.query(
          `INSERT INTO tt_tasks (task_description, stakeholder, section, create_date, initial_target_date,
             revised_date_1, revised_date_2, revised_date_3, revised_date_4, revised_date_5,
             completion_date, remarks, sheet_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [t.task_description, t.stakeholder, t.section, t.create_date, t.initial_target_date,
           t.revised_date_1, t.revised_date_2, t.revised_date_3, t.revised_date_4, t.revised_date_5,
           t.completion_date, t.remarks, t.sheet_name]
        );
        if (t.stakeholder) {
          await pool.query('INSERT INTO tt_stakeholders (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [t.stakeholder]);
        }
      }
      console.log(`Seeded ${seedData.length} tasks from Excel data`);
    } catch (e) {
      console.log('Seed skipped:', e.message);
    }
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
    const { rows } = await pool.query('SELECT * FROM tt_users WHERE email=$1', [email.toLowerCase()]);
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
    const { rows } = await pool.query('SELECT id,name,email,role,created_at FROM tt_users WHERE id=$1', [req.user.id]);
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
    const { rows } = await pool.query('SELECT id,name,email,role,whatsapp_number,created_at FROM tt_users ORDER BY created_at ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role, whatsapp_number } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO tt_users (name, email, password, role, whatsapp_number) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role,whatsapp_number,created_at`,
      [name, email.toLowerCase(), hash, role || 'viewer', whatsapp_number || null]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, role, password, whatsapp_number } = req.body;
    let q, params;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      q = `UPDATE tt_users SET name=$1, email=$2, role=$3, password=$4, whatsapp_number=$5 WHERE id=$6 RETURNING id,name,email,role,whatsapp_number,created_at`;
      params = [name, email.toLowerCase(), role, hash, whatsapp_number || null, req.params.id];
    } else {
      q = `UPDATE tt_users SET name=$1, email=$2, role=$3, whatsapp_number=$4 WHERE id=$5 RETURNING id,name,email,role,whatsapp_number,created_at`;
      params = [name, email.toLowerCase(), role, whatsapp_number || null, req.params.id];
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
    await pool.query('DELETE FROM tt_users WHERE id=$1', [req.params.id]);
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
    let q = 'SELECT * FROM tt_tasks WHERE 1=1';
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
      `INSERT INTO tt_tasks (task_description, stakeholder, section, create_date, initial_target_date,
         revised_date_1, revised_date_2, revised_date_3, revised_date_4, revised_date_5,
         completion_date, remarks, sheet_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [task_description, stakeholder||null, section||null, create_date||null, initial_target_date||null,
       revised_date_1||null, revised_date_2||null, revised_date_3||null, revised_date_4||null,
       revised_date_5||null, completion_date||null, remarks||null, sheet_name||'Unit 1']
    );
    if (stakeholder) await pool.query('INSERT INTO tt_stakeholders (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [stakeholder]);
    res.json(calcTask(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tasks/:id', auth, async (req, res) => {
  try {
    const { task_description, stakeholder, section, create_date, initial_target_date,
      revised_date_1, revised_date_2, revised_date_3, revised_date_4, revised_date_5,
      completion_date, remarks, sheet_name } = req.body;
    const result = await pool.query(
      `UPDATE tt_tasks SET task_description=$1, stakeholder=$2, section=$3, create_date=$4,
         initial_target_date=$5, revised_date_1=$6, revised_date_2=$7, revised_date_3=$8,
         revised_date_4=$9, revised_date_5=$10, completion_date=$11, remarks=$12,
         sheet_name=$13, updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [task_description, stakeholder||null, section||null, create_date||null, initial_target_date||null,
       revised_date_1||null, revised_date_2||null, revised_date_3||null, revised_date_4||null,
       revised_date_5||null, completion_date||null, remarks||null, sheet_name||'Unit 1', req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (stakeholder) await pool.query('INSERT INTO tt_stakeholders (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [stakeholder]);
    res.json(calcTask(result.rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/tasks/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM tt_tasks WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================
// DASHBOARD & META
// ========================

app.get('/api/dashboard', auth, async (req, res) => {
  try {
    const { sheet_name } = req.query;
    const result = await pool.query(sheet_name ? 'SELECT * FROM tt_tasks WHERE sheet_name=$1' : 'SELECT * FROM tt_tasks', sheet_name ? [sheet_name] : []);
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

// sections — ?full=true returns {id,name}[], else string[]
app.get('/api/sections', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name FROM tt_sections ORDER BY name');
    if (req.query.full === 'true') return res.json(rows);
    res.json(rows.map(r => r.name));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sections', auth, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await pool.query(
      'INSERT INTO tt_sections (name) VALUES ($1) RETURNING id, name', [name.trim()]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Section already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/sections/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await pool.query(
      'UPDATE tt_sections SET name=$1 WHERE id=$2 RETURNING id, name', [name.trim(), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Section already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/sections/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM tt_sections WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// stakeholders/people — ?full=true returns {id,name,whatsapp_number}[], else string[]
app.get('/api/stakeholders', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, whatsapp_number FROM tt_stakeholders ORDER BY name');
    if (req.query.full === 'true') return res.json(rows);
    res.json(rows.map(r => r.name));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stakeholders', auth, adminOnly, async (req, res) => {
  try {
    const { name, whatsapp_number } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await pool.query(
      'INSERT INTO tt_stakeholders (name, whatsapp_number) VALUES ($1,$2) RETURNING id, name, whatsapp_number',
      [name.trim(), whatsapp_number || null]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Person already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/stakeholders/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, whatsapp_number } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const { rows } = await pool.query(
      'UPDATE tt_stakeholders SET name=$1, whatsapp_number=$2 WHERE id=$3 RETURNING id, name, whatsapp_number',
      [name.trim(), whatsapp_number || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Person already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/stakeholders/:id', auth, adminOnly, async (req, res) => {
  try {
    await pool.query('DELETE FROM tt_stakeholders WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/weekly-scores', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tt_weekly_scores ORDER BY id ASC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/weekly-scores', auth, async (req, res) => {
  try {
    const { week_number, score_percent } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO tt_weekly_scores (week_number, score_percent) VALUES ($1,$2)
       ON CONFLICT (week_number) DO UPDATE SET score_percent=$2 RETURNING *`,
      [week_number, score_percent]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========================
// WHATSAPP
// ========================

async function sendPendingTasksToAll() {
  console.log('WhatsApp cron: sending pending task reminders...');
  const { rows: people } = await pool.query(
    `SELECT id, name, whatsapp_number FROM tt_stakeholders WHERE whatsapp_number IS NOT NULL AND whatsapp_number != ''`
  );
  const results = [];
  for (const person of people) {
    const { rows: tasks } = await pool.query(
      `SELECT * FROM tt_tasks WHERE completion_date IS NULL AND LOWER(stakeholder) = LOWER($1) ORDER BY id ASC`,
      [person.name]
    );
    if (tasks.length === 0) {
      console.log(`WhatsApp: no pending tasks for ${person.name}, skipping`);
      results.push({ name: person.name, number: person.whatsapp_number, status: 'skipped', reason: 'no pending tasks' });
      continue;
    }
    const message = buildMessage(person.name, tasks);
    const result = await sendWhatsApp(person.whatsapp_number, message);
    results.push({ name: person.name, number: person.whatsapp_number, taskCount: tasks.length, ...result });
  }
  console.log('WhatsApp cron: done', JSON.stringify(results));
  return results;
}

// Daily 9:00 AM IST (3:30 AM UTC)
cron.schedule('30 3 * * *', sendPendingTasksToAll, { timezone: 'UTC' });

// Manual trigger — admin only
app.post('/api/whatsapp/send-now', auth, adminOnly, async (req, res) => {
  try {
    const results = await sendPendingTasksToAll();
    const failed = results.filter(r => r.ok === false);
    res.json({ success: true, results, failCount: failed.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// PRIVACY POLICY
// ========================
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Privacy Policy – Highflow Task Tracker</title>
  <style>body{font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#333;line-height:1.6}h1{color:#1a237e}</style></head>
  <body><h1>Privacy Policy</h1><p><strong>App:</strong> Highflow Task Tracker &nbsp;|&nbsp; <strong>Owner:</strong> Highflow Industries Pvt Ltd</p>
  <p>This app is an internal business tool used by Highflow Industries Pvt Ltd to manage and delegate tasks to team members and stakeholders.</p>
  <h2>Data We Collect</h2><ul><li>Employee names and WhatsApp numbers (for task reminders)</li><li>Task details entered by authorised users</li></ul>
  <h2>How We Use Data</h2><ul><li>To send daily WhatsApp reminders about pending tasks to relevant team members</li><li>Internal task tracking and reporting only</li></ul>
  <h2>Data Sharing</h2><p>No personal data is shared with third parties. WhatsApp messages are sent via the Meta WhatsApp Business API.</p>
  <h2>Contact</h2><p>sumit@highflow.in</p></body></html>`);
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
