// =============================================================
// google-api.js — shared Google auth helper for dashboard pages
// that reuse the Google login set up on the Health page (the
// "Connect Fitbit" flow). The token lives in localStorage under
// the same key health.html uses, so every page shares one login.
// Provides window.GoogleAPI = { token, isConnected, gfetch }.
// =============================================================
(function () {
  'use strict';
  const KEY = 'fitbit_tokens_v1';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
  function save(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {} }

  async function refresh(t) {
    if (!t || !t.refresh) return null;
    try {
      const r = await fetch('/api/google-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh }) });
      const j = await r.json();
      if (j.access_token) { const n = { access: j.access_token, refresh: t.refresh, expires: Date.now() + (j.expires_in || 3500) * 1000 }; save(n); return n; }
    } catch (e) {}
    return null;
  }

  function isConnected() { const t = load(); return !!(t && t.access); }

  async function token() {
    let t = load();
    if (!t || !t.access) return null;
    if (t.expires && Date.now() > t.expires - 60000) { const n = await refresh(t); if (n) t = n; }
    return t.access;
  }

  // Authenticated fetch to a Google REST API: adds the bearer token,
  // and retries once after a token refresh on a 401.
  async function gfetch(url, opts) {
    opts = opts || {};
    let t = load();
    if (!t || !t.access) throw new Error('not connected');
    if (t.expires && Date.now() > t.expires - 60000) { const n = await refresh(t); if (n) t = n; }
    const go = (tok) => fetch(url, Object.assign({}, opts, { headers: Object.assign({ 'Authorization': 'Bearer ' + tok, 'Accept': 'application/json' }, opts.headers || {}) }));
    let r = await go(t.access);
    if (r.status === 401) { const n = await refresh(t); if (n) r = await go(n.access); }
    return r;
  }

  window.GoogleAPI = { token, isConnected, gfetch };
})();
