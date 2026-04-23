import { useState, useEffect } from 'react';
import { api } from '../api';

const SHEETS = ['Unit 1', 'Sumit Sir to Mr. Suraj kant'];

const emptyForm = {
  task_description: '',
  stakeholder: '',
  section: '',
  sheet_name: 'Unit 1',
  create_date: new Date().toISOString().split('T')[0],
  initial_target_date: '',
  revised_date_1: '',
  revised_date_2: '',
  revised_date_3: '',
  revised_date_4: '',
  revised_date_5: '',
  completion_date: '',
  remarks: '',
};

function fmtDate(d) {
  if (!d) return '';
  return typeof d === 'string' ? d.split('T')[0] : '';
}

export default function TaskModal({ task, sheetName, onClose, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [sections, setSections] = useState([]);
  const [stakeholders, setStakeholders] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getSections().then(setSections).catch(() => {});
    api.getStakeholders().then(setStakeholders).catch(() => {});
  }, []);

  useEffect(() => {
    if (task) {
      setForm({
        task_description: task.task_description || '',
        stakeholder: task.stakeholder || '',
        section: task.section || '',
        sheet_name: task.sheet_name || 'Unit 1',
        create_date: fmtDate(task.create_date),
        initial_target_date: fmtDate(task.initial_target_date),
        revised_date_1: fmtDate(task.revised_date_1),
        revised_date_2: fmtDate(task.revised_date_2),
        revised_date_3: fmtDate(task.revised_date_3),
        revised_date_4: fmtDate(task.revised_date_4),
        revised_date_5: fmtDate(task.revised_date_5),
        completion_date: fmtDate(task.completion_date),
        remarks: task.remarks || '',
      });
    } else {
      setForm({ ...emptyForm, sheet_name: sheetName || 'Unit 1' });
    }
  }, [task, sheetName]);

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.task_description.trim()) { setError('Task description required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });
      if (task) {
        await api.updateTask(task.id, payload);
      } else {
        await api.createTask(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const revDates = ['revised_date_1', 'revised_date_2', 'revised_date_3', 'revised_date_4', 'revised_date_5'];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{task ? 'Edit Task' : 'New Task'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div style={{ color: '#f44336', marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <div className="form-grid">
              <div className="form-group full">
                <label className="form-label">Task Description *</label>
                <textarea
                  className="form-control"
                  value={form.task_description}
                  onChange={e => set('task_description', e.target.value)}
                  placeholder="Enter task description..."
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Stakeholder</label>
                <input
                  list="stakeholder-list"
                  className="form-control"
                  value={form.stakeholder}
                  onChange={e => set('stakeholder', e.target.value)}
                  placeholder="e.g. Dinesh Ji"
                />
                <datalist id="stakeholder-list">
                  {stakeholders.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

              <div className="form-group">
                <label className="form-label">Section / Department</label>
                <select className="form-control" value={form.section} onChange={e => set('section', e.target.value)}>
                  <option value="">— Select —</option>
                  {sections.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Sheet</label>
                <select className="form-control" value={form.sheet_name} onChange={e => set('sheet_name', e.target.value)}>
                  {SHEETS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Create Date</label>
                <input type="date" className="form-control" value={form.create_date} onChange={e => set('create_date', e.target.value)} />
              </div>

              <div className="section-divider">Target Dates</div>

              <div className="form-group">
                <label className="form-label">Initial Target Date</label>
                <input type="date" className="form-control" value={form.initial_target_date} onChange={e => set('initial_target_date', e.target.value)} />
              </div>

              <div className="form-group full">
                <label className="form-label">Revised Dates (up to 5 — each deviation reduces score by 1)</label>
                <div className="revised-grid">
                  {revDates.map((f, i) => (
                    <input
                      key={f}
                      type="date"
                      className="form-control"
                      value={form[f]}
                      onChange={e => set(f, e.target.value)}
                      placeholder={`Rev ${i + 1}`}
                    />
                  ))}
                </div>
              </div>

              <div className="section-divider">Completion</div>

              <div className="form-group">
                <label className="form-label">Completion Date</label>
                <input type="date" className="form-control" value={form.completion_date} onChange={e => set('completion_date', e.target.value)} />
              </div>

              <div className="form-group full">
                <label className="form-label">Remarks</label>
                <textarea className="form-control" value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Any notes..." rows={2} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
