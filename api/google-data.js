// ============================================================
// GET /api/google-data?type=<dataType>&filter=<expr>&pageSize=<n>
// Authorization: Bearer <user's Google access_token>
// Proxies to the Google Health API:
//   https://health.googleapis.com/v4/users/me/dataTypes/<type>/dataPoints
// and returns the JSON. Done server-side so the browser doesn't
// have to deal with CORS and the request shape lives in one place.
//
//   type     – dataType id in kebab-case, e.g. heart-rate, sleep,
//              oxygen-saturation, heart-rate-variability,
//              daily-resting-heart-rate, daily-respiratory-rate,
//              daily-sleep-temperature-derivations, steps,
//              active-zone-minutes
//   filter   – AIP-160 filter (field prefix is snake_case), e.g.
//              sleep.interval.end_time >= "2026-06-01T00:00:00Z"
//   pageSize / pageToken – optional pagination passthrough
// ============================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing bearer token' });

  const type = (req.query && req.query.type) || '';
  if (!type || !/^[a-z0-9-]+$/.test(type)) {
    return res.status(400).json({ error: 'valid dataType `type` required (kebab-case)' });
  }

  const fwd = new URLSearchParams();
  if (req.query.filter)    fwd.set('filter',    String(req.query.filter));
  if (req.query.pageSize)  fwd.set('pageSize',  String(req.query.pageSize));
  if (req.query.pageToken) fwd.set('pageToken', String(req.query.pageToken));
  const qs = fwd.toString();

  const url = 'https://health.googleapis.com/v4/users/me/dataTypes/' + type + '/dataPoints'
            + (qs ? '?' + qs : '');

  try {
    const r = await fetch(url, {
      headers: { 'Authorization': auth, 'Accept': 'application/json' },
    });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json');
    return res.send(text);
  } catch (e) {
    return res.status(500).json({ error: 'proxy fetch failed: ' + (e && e.message ? e.message : String(e)) });
  }
}
