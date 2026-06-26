// ============================================================
// GET /api/google-callback?code=...&state=...
// Receives the OAuth code from Google, exchanges it for tokens,
// and bounces back to /health.html with the tokens in the URL
// hash. The hash never reaches the server — only the browser
// reads it, then stores the tokens in localStorage.
//
// This is the Google Health API equivalent of whoop-callback.js,
// used for the Fitbit Air / Google Health integration.
//
// Env vars required on Vercel:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
// The redirect URI is derived from the live host, so it always
// matches the one Google sent the browser back to. Register
//   https://<your-domain>/api/google-callback
// as an "Authorized redirect URI" on the OAuth client in the
// Google Cloud console.
// ============================================================
export default async function handler(req, res) {
  const code = req.query && req.query.code;
  const errorParam = req.query && req.query.error;
  if (errorParam) return res.status(400).send('Google auth error: ' + errorParam);
  if (!code) return res.status(400).send('Missing code parameter.');

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).send('Server not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).');
  }

  // Derive the redirect from the live host so the token-exchange
  // redirect_uri matches the one used at login exactly.
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = proto + '://' + host + '/api/google-callback';

  try {
    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  redirectUri,
      client_id:     clientId,
      client_secret: clientSecret,
    });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await tokenRes.text();
    if (!tokenRes.ok) {
      return res.status(500).send('Google token exchange failed: ' + text);
    }
    let json;
    try { json = JSON.parse(text); } catch (e) {
      return res.status(500).send('Google returned non-JSON: ' + text);
    }
    const access    = json.access_token  || '';
    const refresh   = json.refresh_token || '';
    const expiresIn = json.expires_in    || 3600;
    // refresh_token is only returned on the first consent (or when
    // prompt=consent is sent). The frontend forces prompt=consent so
    // we reliably get one.
    const state = (req.query && req.query.state) || '';
    const hash = new URLSearchParams({
      g_access:  access,
      g_refresh: refresh,
      g_expires: String(Date.now() + expiresIn * 1000),
      g_state:   state,
    }).toString();
    res.writeHead(302, { Location: '/health.html#' + hash });
    res.end();
  } catch (e) {
    res.status(500).send('Unexpected error: ' + (e && e.message ? e.message : String(e)));
  }
}
