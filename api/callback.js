/* =====================================================================
   api/callback.js  —  Vercel Serverless Function
   GitHub redirects here after the user authorizes the app.
   We exchange the one-time `code` for an access token, then redirect
   back to the frontend with the token in the URL hash.

   SECURITY NOTE:
   Passing the token in the hash (#token=…) keeps it out of server
   logs and referrer headers. For a production app you would instead
   set an httpOnly cookie here. For a personal tool this is acceptable.
   ===================================================================== */

export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  // GitHub may redirect with an error (e.g. user denied access)
  if (error) {
    console.error('GitHub OAuth error:', error, error_description);
    res.redirect(302, `/?auth_error=${encodeURIComponent(error_description || error)}`);
    return;
  }

  if (!code) {
    res.status(400).json({ error: 'Missing OAuth code.' });
    return;
  }

  const clientId     = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET env vars.' });
    return;
  }

  try {
    // Exchange the temporary code for a long-lived access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method:  'POST',
      headers: {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error('Token exchange error:', tokenData);
      res.redirect(302, `/?auth_error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
      return;
    }

    const accessToken = tokenData.access_token;

    // Redirect to the frontend — token in the hash (never in the query string)
    res.redirect(302, `/#token=${accessToken}`);
  } catch (err) {
    console.error('Callback handler error:', err);
    res.status(500).json({ error: 'Internal server error during OAuth token exchange.' });
  }
}
