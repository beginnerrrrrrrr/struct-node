/* =====================================================================
   api/auth.js  —  Vercel Serverless Function
   Redirects the browser to GitHub's OAuth authorization page.
   ===================================================================== */

export default function handler(req, res) {
  const clientId   = process.env.GITHUB_CLIENT_ID;
  const appUrl     = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.APP_URL || `https://${req.headers.host}`;

  if (!clientId) {
    res.status(500).json({ error: 'GITHUB_CLIENT_ID is not set in environment variables.' });
    return;
  }

  const params = new URLSearchParams({
    client_id:    clientId,
    redirect_uri: `${appUrl}/api/callback`,
    scope:        'repo',          // repo = full private+public repo access
    // To restrict to public repos only change to: 'public_repo'
  });

  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
}
