import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Dashboard({ sheetName }) {
  const [stats, setStats] = useState(null);
  const [weeklyScores, setWeeklyScores] = useState([]);
  const [newWeek, setNewWeek] = useState({ week_number: '', score_percent: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getDashboard(sheetName ? { sheet_name: sheetName } : {}),
      api.getWeeklyScores(),
    ]).then(([s, w]) => {
      setStats(s);
      setWeeklyScores(w);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [sheetName]);

  async function addWeekScore(e) {
    e.preventDefault();
    if (!newWeek.week_number || !newWeek.score_percent) return;
    await api.saveWeeklyScore(newWeek);
    const w = await api.getWeeklyScores();
    setWeeklyScores(w);
    setNewWeek({ week_number: '', score_percent: '' });
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!stats) return null;

  const completionPct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Dashboard</h2>
        <p style={{ color: '#888', fontSize: 13 }}>
          {sheetName || 'All sheets'} — {new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="stat-grid">
        <div className="stat-card blue">
          <div className="stat-label">Total Tasks</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Completed</div>
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-sub">{completionPct}% done</div>
        </div>
        <div className="stat-card orange">
          <div className="stat-label">Pending</div>
          <div className="stat-value">{stats.pending}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Overdue</div>
          <div className="stat-value">{stats.overdue}</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-label">Avg Score</div>
          <div className="stat-value">{stats.avgScore || '—'}</div>
          <div className="stat-sub">out of 5.0</div>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><h3>Overall Completion</h3><span style={{ fontSize: 15, fontWeight: 700 }}>{completionPct}%</span></div>
        <div style={{ padding: '16px 20px' }}>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${completionPct}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: '#888' }}>
            <span>{stats.completed} completed</span>
            <span>{stats.pending} remaining</span>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        {/* Stakeholder Performance */}
        <div className="card">
          <div className="card-header"><h3>Stakeholder Performance</h3></div>
          <div className="table-wrap">
            {stats.stakeholderStats.length === 0 ? (
              <div className="empty"><div>No data yet</div></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Total</th>
                    <th>Done</th>
                    <th>Pending</th>
                    <th>Avg Score</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.stakeholderStats.map(s => (
                    <tr key={s.name}>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td>{s.total}</td>
                      <td style={{ color: '#4caf50', fontWeight: 600 }}>{s.completed}</td>
                      <td style={{ color: s.pending > 0 ? '#ff9800' : '#999' }}>{s.pending}</td>
                      <td>
                        <span style={{
                          fontWeight: 700,
                          color: s.avgScore >= 4 ? '#4caf50' : s.avgScore >= 3 ? '#ff9800' : s.avgScore === '-' ? '#ccc' : '#f44336'
                        }}>
                          {s.avgScore === '-' ? '—' : `${s.avgScore}/5`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Section Breakdown */}
        <div className="card">
          <div className="card-header"><h3>Section Breakdown</h3></div>
          <div className="table-wrap">
            {stats.sectionStats.length === 0 ? (
              <div className="empty"><div>No data yet</div></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Total</th>
                    <th>Done</th>
                    <th>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sectionStats.map(s => {
                    const pct = Math.round((s.completed / s.total) * 100);
                    return (
                      <tr key={s.name}>
                        <td><span className="badge badge-section">{s.name}</span></td>
                        <td>{s.total}</td>
                        <td style={{ fontWeight: 600, color: '#4caf50' }}>{s.completed}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="progress-bar" style={{ flex: 1, minWidth: 60 }}>
                              <div className="progress-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span style={{ fontSize: 11, color: '#888', width: 28 }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Weekly Score */}
      <div className="card">
        <div className="card-header">
          <h3>Weekly Score Tracking</h3>
          <form onSubmit={addWeekScore} style={{ display: 'flex', gap: 8 }}>
            <input
              className="filter-input"
              style={{ width: 120 }}
              placeholder="Week # 25"
              value={newWeek.week_number}
              onChange={e => setNewWeek(w => ({ ...w, week_number: e.target.value }))}
            />
            <input
              className="filter-input"
              style={{ width: 90 }}
              type="number"
              placeholder="Score %"
              value={newWeek.score_percent}
              onChange={e => setNewWeek(w => ({ ...w, score_percent: e.target.value }))}
            />
            <button type="submit" className="btn btn-primary btn-sm">Add</button>
          </form>
        </div>
        <div style={{ padding: '16px 20px' }}>
          {weeklyScores.length === 0 ? (
            <div style={{ color: '#ccc', textAlign: 'center', padding: 20 }}>No weekly scores yet</div>
          ) : (
            weeklyScores.map(w => {
              const pct = Math.max(0, Math.min(100, Math.abs(parseFloat(w.score_percent) || 0)));
              const color = pct >= 80 ? '#4caf50' : pct >= 60 ? '#ff9800' : '#f44336';
              return (
                <div key={w.id} className="week-row">
                  <span className="week-label">{w.week_number}</span>
                  <div className="week-bar-wrap">
                    <div className="week-bar" style={{ width: `${pct}%`, background: color }}>
                      {pct > 15 && `${pct.toFixed(0)}%`}
                    </div>
                  </div>
                  <span className="week-score" style={{ color }}>{parseFloat(w.score_percent).toFixed(1)}%</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
