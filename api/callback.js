/* =====================================================================
   api/callback.js  —  Vercel Serverless Function
   Exchanges the one-time GitHub OAuth `code` for an access token,
   then stores it in an httpOnly cookie. The token is NEVER sent to
   the browser's JavaScript context — it only travels in Set-Cookie.

   SECURITY:
   - httpOnly  → JS cannot read the cookie (no XSS risk)
   - Secure    → cookie only sent over HTTPS (production)
   - SameSite=Strict → blocks CSRF from cross-origin requests
   ===================================================================== */

function buildSetCookieHeader(token, req) {
  const isSecure = (req.headers['x-forwarded-proto'] === 'https')
                || process.env.VERCEL_ENV === 'production';
  return [
    `gh_token=${token}`,
    'HttpOnly',
    isSecure ? 'Secure' : '',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=2592000',
  ].filter(Boolean).join('; ');
}

export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error('GitHub OAuth error:', error, error_description);
    res.redirect(302, `/?auth_error=${encodeURIComponent(error_description || error)}`);
    return;
  }
  if (!code) {
    res.status(400).send('Missing OAuth code.');
    return;
  }

  const clientId     = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).send('Server configuration error: missing OAuth credentials.');
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
      console.error('Token exchange failed:', tokenData);
      res.redirect(302, `/?auth_error=${encodeURIComponent(tokenData.error_description || 'Token exchange failed')}`);
      return;
    }

    res.setHeader('Set-Cookie', buildSetCookieHeader(tokenData.access_token, req));
    res.redirect(302, '/?login=success');
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send('Internal server error during OAuth flow.');
  }
}
