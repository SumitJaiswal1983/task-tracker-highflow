const BASE = import.meta.env.PROD ? '/api' : 'http://localhost:5003/api';

function getToken() {
  return localStorage.getItem('tt_token');
}

async function req(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (res.status === 401) {
    localStorage.removeItem('tt_token');
    localStorage.removeItem('tt_user');
    window.location.reload();
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  login: (email, password) =>
    req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => req('/auth/me'),

  getUsers: () => req('/users'),
  createUser: data => req('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id, data) => req(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: id => req(`/users/${id}`, { method: 'DELETE' }),

  getTasks: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/tasks${q ? '?' + q : ''}`);
  },
  createTask: data => req('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => req(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: id => req(`/tasks/${id}`, { method: 'DELETE' }),

  getDashboard: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return req(`/dashboard${q ? '?' + q : ''}`);
  },
  getSections: () => req('/sections'),
  getStakeholders: () => req('/stakeholders'),
  getWeeklyScores: () => req('/weekly-scores'),
  saveWeeklyScore: data => req('/weekly-scores', { method: 'POST', body: JSON.stringify(data) }),
};
