// =============================================================
// sheets.js — append to / read a personal Google Sheet
// ("Connor's Dashboard") used by the Meals and Weight pages.
// Auto-creates the sheet on first use and remembers its id in
// localStorage + Supabase (so every device shares one sheet).
// Needs GoogleAPI (google-api.js); for cross-device id sync it
// also uses the Supabase client + window.DASH_SUPABASE_* from
// /api/config. Provides window.Sheets.
// =============================================================
(function () {
  'use strict';
  const TITLE = "Connor's Dashboard";
  const ID_KEY = 'dash_sheet_id';
  const HEADERS = {
    Meals:  ['Date', 'Meal', 'Scheduled', 'Food', 'Actual', 'Timing'],
    Weight: ['Date', 'Time', 'Weight', 'Unit', 'Note']
  };

  function supa() {
    const url = window.DASH_SUPABASE_URL || '';
    const key = window.DASH_SUPABASE_KEY || '';
    if (!url || !key || !window.supabase) return null;
    try { return window.supabase.createClient(url, key); } catch { return null; }
  }

  async function loadId() {
    try { const c = localStorage.getItem(ID_KEY); if (c) return c; } catch {}
    const s = supa();
    if (s) {
      try {
        const { data } = await s.from('app_state').select('data').eq('key', 'dash_sheets').maybeSingle();
        if (data && data.data && data.data.spreadsheetId) { try { localStorage.setItem(ID_KEY, data.data.spreadsheetId); } catch {} return data.data.spreadsheetId; }
      } catch (e) {}
    }
    return null;
  }
  async function saveId(id) {
    try { localStorage.setItem(ID_KEY, id); } catch {}
    const s = supa();
    if (s) { try { await s.from('app_state').upsert({ key: 'dash_sheets', data: { spreadsheetId: id }, updated_at: new Date().toISOString() }, { onConflict: 'key' }); } catch (e) {} }
  }

  async function appendRow(id, tab, values) {
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values/'
      + encodeURIComponent(tab + '!A1') + ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';
    const r = await GoogleAPI.gfetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [values] }) });
    if (!r.ok) throw new Error('append failed (' + r.status + '): ' + (await r.text()));
    return r.json();
  }
  async function readRows(id, tab) {
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values/' + encodeURIComponent(tab + '!A1:Z10000');
    const r = await GoogleAPI.gfetch(url, {});
    if (!r.ok) throw new Error('read failed (' + r.status + '): ' + (await r.text()));
    const j = await r.json();
    return j.values || [];
  }

  async function createSheet() {
    const body = { properties: { title: TITLE }, sheets: [{ properties: { title: 'Meals' } }, { properties: { title: 'Weight' } }] };
    const r = await GoogleAPI.gfetch('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('create failed (' + r.status + '): ' + (await r.text()));
    const j = await r.json();
    const id = j.spreadsheetId;
    await appendRow(id, 'Meals', HEADERS.Meals);
    await appendRow(id, 'Weight', HEADERS.Weight);
    await saveId(id);
    return id;
  }

  // Returns a usable spreadsheet id, creating the sheet if needed.
  async function ensureSheet() {
    const id = await loadId();
    if (id) {
      const r = await GoogleAPI.gfetch('https://sheets.googleapis.com/v4/spreadsheets/' + id + '?fields=spreadsheetId', {});
      if (r.ok) return id;
      if (r.status === 403) throw new Error('PERMISSION_DENIED'); // scope not granted yet
      // 404 / deleted → fall through and recreate
    }
    return createSheet();
  }

  window.Sheets = {
    ensureSheet, appendRow, readRows, loadId, saveId,
    link: (id) => 'https://docs.google.com/spreadsheets/d/' + id
  };
})();
