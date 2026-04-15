/* =====================================================================
   api/logout.js  —  Vercel Serverless Function
   Clears the httpOnly session cookie, effectively logging the user out.
   ===================================================================== */

export default function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  // Overwrite the cookie with an expired one
  res.setHeader(
    'Set-Cookie',
    'gh_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
  );
  res.status(200).json({ ok: true });
}
