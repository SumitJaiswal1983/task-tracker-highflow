import { useState, useEffect } from 'react';
import { api } from '../api';

const ROLES = ['admin', 'viewer'];

function UserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    role: user?.role || 'viewer',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.email) { setError('Name and email required'); return; }
    if (!user && !form.password) { setError('Password required for new user'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = { name: form.name, email: form.email, role: form.role };
      if (form.password) payload.password = form.password;
      if (user) {
        await api.updateUser(user.id, payload);
      } else {
        await api.createUser(payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>{user ? 'Edit User' : 'New User'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div style={{ color: '#f44336', marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Dinesh Kumar" />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input type="email" className="form-control" value={form.email} onChange={e => set('email', e.target.value)} placeholder="dinesh@highflow.in" />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-control" value={form.role} onChange={e => set('role', e.target.value)}>
                  <option value="viewer">Viewer (read only)</option>
                  <option value="admin">Admin (full access)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{user ? 'New Password (blank = no change)' : 'Password *'}</label>
                <input
                  type="password"
                  className="form-control"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder={user ? 'Leave blank to keep current' : 'Min 6 characters'}
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : user ? 'Update' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Users({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deleteUser(u) {
    if (!window.confirm(`Delete user ${u.name}?`)) return;
    await api.deleteUser(u.id);
    load();
  }

  function onSaved() { setShowModal(false); setEditUser(null); load(); }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>User Management</h2>
          <p style={{ fontSize: 13, color: '#888', marginTop: 2 }}>Control who can access this app</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditUser(null); setShowModal(true); }}>+ New User</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                      {u.id === currentUser.id && (
                        <span style={{ marginLeft: 8, fontSize: 10, background: '#e3f2fd', color: '#1565c0', padding: '1px 6px', borderRadius: 10 }}>You</span>
                      )}
                    </td>
                    <td style={{ color: '#555' }}>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-completed' : 'badge-section'}`}>
                        {u.role === 'admin' ? 'Admin' : 'Viewer'}
                      </span>
                    </td>
                    <td style={{ color: '#888', fontSize: 12 }}>{fmtDate(u.created_at)}</td>
                    <td>
                      <div className="action-btns">
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditUser(u); setShowModal(true); }}>✏ Edit</button>
                        {u.id !== currentUser.id && (
                          <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u)}>✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ background: '#fffde7', border: '1px solid #fff9c4' }}>
        <div style={{ padding: '14px 20px' }}>
          <p style={{ fontSize: 13, color: '#f57f17', fontWeight: 600, marginBottom: 4 }}>Role Permissions</p>
          <p style={{ fontSize: 12, color: '#795548' }}>
            <strong>Admin</strong> — Full access: create/edit/delete tasks, manage users, view dashboard<br />
            <strong>Viewer</strong> — Can view tasks and dashboard, mark tasks complete. Cannot delete or manage users.
          </p>
        </div>
      </div>

      {showModal && (
        <UserModal user={editUser} onClose={() => { setShowModal(false); setEditUser(null); }} onSaved={onSaved} />
      )}
    </div>
  );
}
