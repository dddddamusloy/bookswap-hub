// client/src/api.js

// Change this if your backend runs elsewhere:
const API = (typeof window !== 'undefined' && window.location)
  ? `http://${window.location.hostname}:5000`
  : 'http://localhost:5000';

const token = () => localStorage.getItem('token') || '';

async function request(path, opts = {}) {
  const url = `${API}${path}`;
  const res = await fetch(url, opts);

  // Try to parse JSON; if server returned HTML (like a 404 page), surface a readable error.
  let data;
  try {
    data = await res.json();
  } catch {
    const text = await res.text().catch(() => '');
    return { ok: false, error: text || `Request failed (${res.status})`, status: res.status };
  }

  // attach status + ok to always know if it worked
  return { ...data, ok: res.ok, status: res.status };
}

export const Auth = {
  register: (data) =>
    request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  login: async (data) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Handle lockout / attempts left from backend
      if (j.locked) {
        alert(`Account locked. Try again in ~${j.minutesLeft ?? 60} minute(s).`);
      } else if (typeof j.attemptsLeft === 'number') {
        alert(`Invalid credentials. ${j.attemptsLeft} attempt(s) left.`);
      } else {
        alert(j.error || 'Login failed');
      }
      return { ok: false, ...j };
    }

    // success
    if (j?.token) localStorage.setItem('token', j.token);
    return { ok: true, ...j };
  },

  me: () =>
    request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token()}` },
    }),

  logout: async () => {
    localStorage.removeItem('token');
    return request('/api/auth/logout', { method: 'POST' });
  },
};

export const Books = {
  list: () => request('/api/books'),

  // requires auth
  mine: () =>
    request('/api/books/mybooks', {
      headers: { Authorization: `Bearer ${token()}` },
    }),

  create: (formData) =>
    request('/api/books', {
      method: 'POST',
      body: formData, // no content-type; browser sets the multipart boundary
    }),

  update: (id, formData) =>
    request(`/api/books/${id}`, {
      method: 'PUT',
      body: formData,
    }),

  // owner delete (admin uses Admin.delete)
  delete: (id, ownerEmail) =>
    request(`/api/books/${id}?email=${encodeURIComponent(ownerEmail || '')}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    }),
};

export const Admin = {
  listBooks: (approval) => {
    const qs = approval ? `?approval=${encodeURIComponent(approval)}` : '';
    return request(`/api/admin/books${qs}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
  },
  approve: (id) =>
    request(`/api/admin/books/${id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}` },
    }),
  reject: (id) =>
    request(`/api/admin/books/${id}/reject`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}` },
    }),
  delete: (id) =>
    request(`/api/admin/books/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    }),
};

export const Swaps = {
  request: (payload) =>
    request('/api/swaps/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  incoming: (email) =>
    request(`/api/swaps/incoming?email=${encodeURIComponent(email)}`),

  mine: (email) =>
    request(`/api/swaps/mine?email=${encodeURIComponent(email)}`),

  act: (id, action, ownerEmail) =>
    request(`/api/swaps/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerEmail }),
    }),
};
