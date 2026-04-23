import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import TaskModal from './TaskModal';

function fmt(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCSV(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ScoreDisplay({ score }) {
  if (score === null || score === undefined) return <span style={{ color: '#ccc' }}>—</span>;
  const colors = ['#9e9e9e', '#f44336', '#ff9800', '#ffc107', '#8bc34a', '#4caf50'];
  return (
    <span style={{ fontWeight: 700, color: colors[score] || '#333', fontSize: 15 }}>
      {score}/5
    </span>
  );
}

function exportCSV(tasks, sheetName) {
  const headers = [
    'S.No', 'Task Description', 'Assigned To', 'Section',
    'Create Date', 'Initial Target Date',
    'Revised Date 1', 'Revised Date 2', 'Revised Date 3', 'Revised Date 4', 'Revised Date 5',
    'No of Deviations', 'Completion Date', 'Remarks', 'Status', 'Score'
  ];

  const rows = tasks.map((t, i) => [
    i + 1,
    `"${(t.task_description || '').replace(/"/g, '""')}"`,
    `"${t.stakeholder || ''}"`,
    `"${t.section || ''}"`,
    fmtCSV(t.create_date),
    fmtCSV(t.initial_target_date),
    fmtCSV(t.revised_date_1),
    fmtCSV(t.revised_date_2),
    fmtCSV(t.revised_date_3),
    fmtCSV(t.revised_date_4),
    fmtCSV(t.revised_date_5),
    t.no_of_deviations,
    fmtCSV(t.completion_date),
    `"${(t.remarks || '').replace(/"/g, '""')}"`,
    t.achievement_status,
    t.score !== null && t.score !== undefined ? `${t.score}/5` : '',
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Tasks_${sheetName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TaskList({ sheetName }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState([]);
  const [stakeholders, setStakeholders] = useState([]);
  const [filters, setFilters] = useState({ section: '', stakeholder: '', status: '', search: '' });
  const [modalTask, setModalTask] = useState(undefined);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { sheet_name: sheetName };
      if (filters.section) params.section = filters.section;
      if (filters.stakeholder) params.stakeholder = filters.stakeholder;
      if (filters.status) params.status = filters.status;
      const data = await api.getTasks(params);
      setTasks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [sheetName, filters.section, filters.stakeholder, filters.status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.getSections().then(setSections).catch(() => {});
    api.getStakeholders().then(setStakeholders).catch(() => {});
  }, []);

  function openNew() { setModalTask(null); setShowModal(true); }
  function openEdit(task) { setModalTask(task); setShowModal(true); }
  function closeModal() { setShowModal(false); setModalTask(undefined); }
  function onSaved() { closeModal(); load(); }

  async function deleteTask(id) {
    if (!window.confirm('Delete this task?')) return;
    await api.deleteTask(id);
    load();
  }

  async function markComplete(task) {
    const today = new Date().toISOString().split('T')[0];
    await api.updateTask(task.id, { ...task, completion_date: today });
    load();
  }

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const filtered = filters.search
    ? tasks.filter(t =>
        t.task_description?.toLowerCase().includes(filters.search.toLowerCase()) ||
        t.stakeholder?.toLowerCase().includes(filters.search.toLowerCase()) ||
        t.remarks?.toLowerCase().includes(filters.search.toLowerCase())
      )
    : tasks;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>
          Tasks — <span style={{ color: '#666', fontWeight: 400 }}>{sheetName}</span>
          <span style={{ marginLeft: 10, background: '#e3f2fd', color: '#1565c0', padding: '2px 8px', borderRadius: 20, fontSize: 12 }}>
            {filtered.length}
          </span>
        </h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-ghost"
            onClick={() => exportCSV(filtered, sheetName)}
            disabled={filtered.length === 0}
            title="Download CSV"
          >
            ⬇ Export CSV
          </button>
          <button className="btn btn-primary" onClick={openNew}>+ New Task</button>
        </div>
      </div>

      <div className="filters">
        <input
          className="filter-input"
          placeholder="Search task, person, remarks..."
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
        />
        <select className="filter-select" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Completed">Completed</option>
        </select>
        <select className="filter-select" value={filters.section} onChange={e => setFilter('section', e.target.value)}>
          <option value="">All Sections</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={filters.stakeholder} onChange={e => setFilter('stakeholder', e.target.value)}>
          <option value="">All People</option>
          {stakeholders.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(filters.search || filters.status || filters.section || filters.stakeholder) && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ section: '', stakeholder: '', status: '', search: '' })}>
            ✕ Clear
          </button>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📋</div>
              <div style={{ marginBottom: 12 }}>No tasks found</div>
              <button className="btn btn-primary" onClick={openNew}>+ Add First Task</button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Task</th>
                  <th>Assigned To</th>
                  <th>Section</th>
                  <th>Target Date</th>
                  <th>Deviations</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((task, idx) => {
                  const effTarget =
                    task.revised_date_5 || task.revised_date_4 || task.revised_date_3 ||
                    task.revised_date_2 || task.revised_date_1 || task.initial_target_date;
                  return (
                    <tr key={task.id}>
                      <td style={{ color: '#aaa', fontSize: 12 }}>{idx + 1}</td>
                      <td>
                        <span className="task-desc-text" title={task.task_description}>
                          {task.task_description}
                        </span>
                        {task.remarks && (
                          <span style={{ display: 'block', fontSize: 11, color: '#aaa', marginTop: 2 }}>
                            {task.remarks.substring(0, 55)}{task.remarks.length > 55 ? '...' : ''}
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{task.stakeholder || '-'}</td>
                      <td>
                        {task.section
                          ? <span className="badge badge-section">{task.section}</span>
                          : '-'}
                      </td>
                      <td>
                        <span className={`date-chip${task.is_overdue ? ' overdue' : ''}`}>
                          {fmt(effTarget)}
                        </span>
                        {task.no_of_deviations > 0 && (
                          <span style={{ display: 'block', fontSize: 10, color: '#aaa', marginTop: 2 }}>
                            Initial: {fmt(task.initial_target_date)}
                          </span>
                        )}
                      </td>
                      <td>
                        {task.no_of_deviations > 0
                          ? <span className="deviate-count">{task.no_of_deviations}x</span>
                          : <span style={{ color: '#4caf50', fontSize: 12 }}>✓ On time</span>
                        }
                      </td>
                      <td>
                        <span className={`badge badge-${task.achievement_status === 'Completed' ? 'completed' : task.is_overdue ? 'overdue' : 'pending'}`}>
                          {task.is_overdue ? 'Overdue' : task.achievement_status}
                        </span>
                      </td>
                      <td><ScoreDisplay score={task.score} /></td>
                      <td>
                        <div className="action-btns">
                          {task.achievement_status === 'Pending' && (
                            <button
                              className="complete-btn"
                              onClick={() => markComplete(task)}
                              title="Mark complete"
                            >
                              ✓ Done
                            </button>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(task)} title="Edit">✏</button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteTask(task.id)} title="Delete">✕</button>
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

      {showModal && (
        <TaskModal
          task={modalTask || null}
          sheetName={sheetName}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
