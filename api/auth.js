/* =====================================================================
   api/auth.js  —  Vercel Serverless Function
   Redirects the browser to GitHub's OAuth authorization page.

   SECURITY:
   - CSRF `state` token: a random 32-byte hex string is generated each
     time, stored in a short-lived httpOnly cookie, and included in the
     GitHub redirect. The callback verifies it matches before accepting
     any OAuth code. This prevents cross-site request forgery on the
     OAuth flow.
   - Note: `client_id` in the OAuth redirect URL is public by design
     (GitHub's spec). It identifies your app but is NOT secret.
     Your client_secret never leaves the server.
   ===================================================================== */

import { randomBytes } from 'crypto';

export default function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const appUrl   = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.APP_URL || `https://${req.headers.host}`;

  if (!clientId) {
    res.status(500).json({ error: 'Server configuration error.' });
    return;
  }

  // Generate a cryptographically random state token to prevent OAuth CSRF
  const state = randomBytes(32).toString('hex');

  const isSecure = req.headers['x-forwarded-proto'] === 'https'
                || process.env.VERCEL_ENV === 'production';

  // Store state in a short-lived httpOnly cookie (10 min, only for /api/callback)
  const stateCookie = [
    `oauth_state=${state}`,
    'HttpOnly',
    isSecure ? 'Secure' : '',
    'SameSite=Lax',          // Lax (not Strict) so cookie survives GitHub redirect back
    'Path=/api/callback',
    'Max-Age=600',            // 10 min — only needed for the round-trip
  ].filter(Boolean).join('; ');

  res.setHeader('Set-Cookie', stateCookie);

  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: `${appUrl}/api/callback`,
    scope:        'repo',
    state,
  });

  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
}
