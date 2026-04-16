/* =====================================================================
   api/callback.js  —  Vercel Serverless Function
   Exchanges the one-time GitHub OAuth `code` for an access token,
   then stores it in an httpOnly cookie.

   SECURITY:
   - Validates `state` parameter against the cookie set in /api/auth
     to prevent OAuth CSRF attacks
   - httpOnly  → JS cannot read the session cookie (no XSS risk)
   - Secure    → cookie only sent over HTTPS
   - SameSite=Strict → blocks CSRF from cross-origin requests
   - Token is NEVER sent to the browser JS context
   ===================================================================== */

function getTokenFromCookie(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)gh_token=([^;]+)/);
  return match ? match[1] : null;
}

function getStateFromCookie(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)oauth_state=([^;]+)/);
  return match ? match[1] : null;
}

function buildSessionCookie(token, req) {
  const isSecure = req.headers['x-forwarded-proto'] === 'https'
                || process.env.VERCEL_ENV === 'production';
  return [
    `gh_token=${token}`,
    'HttpOnly',
    isSecure ? 'Secure' : '',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=2592000',       // 30 days
  ].filter(Boolean).join('; ');
}

function clearStateCookie() {
  // Immediately expire the one-time state cookie after use
  return 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/callback; Max-Age=0';
}

export default async function handler(req, res) {
  const { code, state: returnedState, error, error_description } = req.query;

  if (error) {
    console.error('GitHub OAuth error:', error, error_description);
    res.setHeader('Set-Cookie', clearStateCookie());
    res.redirect(302, `/?auth_error=${encodeURIComponent(error_description || error)}`);
    return;
  }

  // Validate CSRF state — must match what we stored in the cookie
  const expectedState = getStateFromCookie(req);
  if (!expectedState || !returnedState || expectedState !== returnedState) {
    console.error('OAuth state mismatch — possible CSRF attempt');
    res.setHeader('Set-Cookie', clearStateCookie());
    res.status(403).send('Invalid state parameter. Please try logging in again.');
    return;
  }

  if (!code) {
    res.setHeader('Set-Cookie', clearStateCookie());
    res.status(400).send('Missing OAuth code.');
    return;
  }

  const clientId     = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).send('Server configuration error.');
    return;
  }

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method:  'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('Token exchange failed:', tokenData.error);
      res.setHeader('Set-Cookie', clearStateCookie());
      res.redirect(302, `/?auth_error=${encodeURIComponent(tokenData.error_description || 'Token exchange failed')}`);
      return;
    }

    // Set session cookie and clear one-time state cookie in one response
    res.setHeader('Set-Cookie', [
      buildSessionCookie(tokenData.access_token, req),
      clearStateCookie(),
    ]);
    res.redirect(302, '/?login=success');
  } catch (err) {
    console.error('Callback error:', err);
    res.setHeader('Set-Cookie', clearStateCookie());
    res.status(500).send('Internal server error during OAuth flow.');
  }
}
