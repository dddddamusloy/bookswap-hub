// client/src/api.js

// Backend base URL:
// - In Vercel, set REACT_APP_API_URL to your Render URL, e.g.
//   https://bookswap-hub.onrender.com
// - In local dev it falls back to http://localhost:5000
const API_ROOT =
  (typeof process !== "undefined" && process.env.REACT_APP_API_URL) ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://bookswap-hub.onrender.com");

// We already mount routes in the server under /api/*
const API = `${API_ROOT}`;

const token = () => localStorage.getItem("token") || "";

async function request(path, opts = {}) {
  const url = `${API}${path}`;
  const res = await fetch(url, {
    // send cookies only if you ever switch to cookies; harmless otherwise
    credentials: "include",
    ...opts,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: text || `Request failed (${res.status})`,
      status: res.status,
    };
  }

  return { ...data, ok: res.ok, status: res.status };
}

export const Auth = {
  register: (data) =>
    request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  login: async (data) => {
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });

    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (j.locked) {
        alert(`Account locked. Try again in ~${j.minutesLeft ?? 60} minute(s).`);
      } else if (typeof j.attemptsLeft === "number") {
        alert(`Invalid credentials. ${j.attemptsLeft} attempt(s) left.`);
      } else {
        alert(j.error || "Login failed");
      }
      return { ok: false, ...j };
    }

    if (j?.token) localStorage.setItem("token", j.token);
    return { ok: true, ...j };
  },

  me: () =>
    request("/api/auth/me", {
      headers: { Authorization: `Bearer ${token()}` },
      credentials: "include",
    }),

  logout: async () => {
    localStorage.removeItem("token");
    return request("/api/auth/logout", { method: "POST", credentials: "include" });
  },
};

export const Books = {
  list: () => request("/api/books"),

  mine: () =>
    request("/api/books/mybooks", {
      headers: { Authorization: `Bearer ${token()}` },
    }),

  create: (formData) =>
    request("/api/books", {
      method: "POST",
      body: formData, // browser sets multipart boundary
    }),

  update: (id, formData) =>
    request(`/api/books/${id}`, {
      method: "PUT",
      body: formData,
    }),

  delete: (id, ownerEmail) =>
    request(`/api/books/${id}?email=${encodeURIComponent(ownerEmail || "")}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    }),
};

export const Admin = {
  listBooks: (approval) => {
    const qs = approval ? `?approval=${encodeURIComponent(approval)}` : "";
    return request(`/api/admin/books${qs}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });
  },
  approve: (id) =>
    request(`/api/admin/books/${id}/approve`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}` },
    }),
  reject: (id) =>
    request(`/api/admin/books/${id}/reject`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}` },
    }),
  delete: (id) =>
    request(`/api/admin/books/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token()}` },
    }),
};

export const Swaps = {
  request: (payload) =>
    request("/api/swaps/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  incoming: (email) =>
    request(`/api/swaps/incoming?email=${encodeURIComponent(email)}`),

  mine: (email) =>
    request(`/api/swaps/mine?email=${encodeURIComponent(email)}`),

  act: (id, action, ownerEmail) =>
    request(`/api/swaps/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerEmail }),
    }),
};
