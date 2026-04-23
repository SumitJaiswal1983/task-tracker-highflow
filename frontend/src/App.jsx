import { useState, useEffect } from 'react';
import './App.css';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import TaskList from './components/TaskList';
import Users from './components/Users';
import PeopleAndSections from './components/PeopleAndSections';

const SHEETS = [
  { id: 'Unit 1', label: 'Unit 1' },
  { id: 'Sumit Sir to Mr. Suraj kant', label: 'Sumit → Suraj kant' },
];

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('tt_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [tab, setTab] = useState('dashboard');
  const [sheet, setSheet] = useState('Unit 1');

  useEffect(() => {
    if (user) localStorage.setItem('tt_user', JSON.stringify(user));
  }, [user]);

  function handleLogin(u) {
    setUser(u);
  }

  function handleLogout() {
    localStorage.removeItem('tt_token');
    localStorage.removeItem('tt_user');
    setUser(null);
  }

  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <>
      <header className="header">
        <div className="header-brand">
          <img src="/highflow-logo.png" alt="Highflow" style={{ height: 34, objectFit: 'contain' }} />
          <div className="header-brand-divider" />
          <h1>Task Delegation Tracker</h1>
        </div>

        <nav className="nav-tabs">
          <button className={`nav-tab${tab === 'dashboard' ? ' active' : ''}`} onClick={() => setTab('dashboard')}>
            Dashboard
          </button>
          <button className={`nav-tab${tab === 'tasks' ? ' active' : ''}`} onClick={() => setTab('tasks')}>
            Tasks
          </button>
          {user.role === 'admin' && (
            <button className={`nav-tab${tab === 'people' ? ' active' : ''}`} onClick={() => setTab('people')}>
              People & Sections
            </button>
          )}
          {user.role === 'admin' && (
            <button className={`nav-tab${tab === 'users' ? ' active' : ''}`} onClick={() => setTab('users')}>
              Users
            </button>
          )}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {tab !== 'users' && tab !== 'people' && (
            <div className="sheet-switcher">
              {SHEETS.map(s => (
                <button
                  key={s.id}
                  className={`sheet-btn${sheet === s.id ? ' active' : ''}`}
                  onClick={() => setSheet(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
              {user.name}
              {user.role === 'admin' && (
                <span style={{ marginLeft: 5, fontSize: 10, background: '#4caf50', color: 'white', padding: '1px 5px', borderRadius: 8 }}>Admin</span>
              )}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleLogout}
              style={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.2)', fontSize: 12 }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        {tab === 'dashboard' && <Dashboard sheetName={sheet} />}
        {tab === 'tasks' && <TaskList sheetName={sheet} currentUser={user} />}
        {tab === 'people' && user.role === 'admin' && <PeopleAndSections />}
        {tab === 'users' && user.role === 'admin' && <Users currentUser={user} />}
      </main>
    </>
  );
}
