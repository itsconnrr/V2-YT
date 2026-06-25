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
    Meals:  ['Date', 'Meal Type', 'Ideal Time', 'What Food?', 'What Time?', 'How Late/Early?', 'Reason / Additional Notes'],
    Weight: ['Date', 'Time', 'Weight (lb)', 'Notes']
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

  async function getSheetIds(id) {
    const r = await GoogleAPI.gfetch('https://sheets.googleapis.com/v4/spreadsheets/' + id + '?fields=sheets(properties(sheetId,title))', {});
    if (!r.ok) throw new Error('getSheetIds failed (' + r.status + ')');
    const j = await r.json(); const m = {};
    (j.sheets || []).forEach(s => { m[s.properties.title] = s.properties.sheetId; });
    return m;
  }
  async function batchUpdate(id, requests) {
    const r = await GoogleAPI.gfetch('https://sheets.googleapis.com/v4/spreadsheets/' + id + ':batchUpdate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });
    if (!r.ok) throw new Error('batchUpdate failed (' + r.status + '): ' + (await r.text()));
    return r.json();
  }
  async function updateRange(id, a1, values2d) {
    const r = await GoogleAPI.gfetch('https://sheets.googleapis.com/v4/spreadsheets/' + id + '/values/' + encodeURIComponent(a1) + '?valueInputOption=USER_ENTERED', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: values2d }) });
    if (!r.ok) throw new Error('update failed (' + r.status + '): ' + (await r.text()));
    return r.json();
  }
  // Insert rows just under the header (row 1) and fill them; existing rows shift down (newest-first).
  async function insertRowsTop(id, tab, rows2d) {
    const ids = await getSheetIds(id); const sid = ids[tab];
    if (sid == null) throw new Error('tab not found: ' + tab);
    await batchUpdate(id, [{ insertDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: 1, endIndex: 1 + rows2d.length }, inheritFromBefore: false } }]);
    await updateRange(id, tab + '!A2', rows2d);
  }

  // Make sure the spreadsheet has the Meals + Weight tabs (create with headers if missing).
  async function ensureTabs(id) {
    try {
      const ids = await getSheetIds(id);
      for (const t of ['Meals', 'Weight']) {
        if (ids[t] == null) { await batchUpdate(id, [{ addSheet: { properties: { title: t } } }]); await appendRow(id, t, HEADERS[t]); }
      }
    } catch (e) {}
  }
  // Point the app at a specific spreadsheet (e.g. one the user created by hand).
  async function useSheet(id) { await saveId(id); await ensureTabs(id); return id; }

  window.Sheets = {
    ensureSheet, appendRow, readRows, loadId, saveId, insertRowsTop, updateRange, useSheet,
    link: (id) => 'https://docs.google.com/spreadsheets/d/' + id
  };
})();
