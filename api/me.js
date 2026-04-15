/* =====================================================================
   api/me.js  —  Vercel Serverless Function
   Returns the authenticated GitHub user from the httpOnly session cookie.
   The client JS never sees the token itself — only the sanitised user object.
   ===================================================================== */

function getTokenFromCookie(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)gh_token=([^;]+)/);
  return match ? match[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const token = getTokenFromCookie(req);
  if (!token) { res.status(200).json({ user: null }); return; }

  try {
    const r = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept:        'application/vnd.github.v3+json',
        'User-Agent':  'DSA-Tracker',
      },
    });

    if (!r.ok) {
      // Token may be revoked — clear cookie
      res.setHeader('Set-Cookie', 'gh_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
      res.status(200).json({ user: null });
      return;
    }

    const u = await r.json();
    // Return ONLY non-sensitive fields to the client
    res.status(200).json({
      user: {
        login:      u.login,
        name:       u.name  || u.login,
        avatar_url: u.avatar_url,
      },
    });
  } catch (err) {
    console.error('api/me error:', err);
    res.status(200).json({ user: null });
  }
}
