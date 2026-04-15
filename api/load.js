/* =====================================================================
   api/load.js  —  Vercel Serverless Function
   Reads progress.json from the user's GitHub repo.
   Auth token is read from the httpOnly cookie — never from the client.

   Request:  GET /api/load?repo=username/dsa-sheet
   Response: { data: <object|null>, sha: <string|null> }
   ===================================================================== */

function getTokenFromCookie(req) {
  const raw   = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)gh_token=([^;]+)/);
  return match ? match[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }

  const token = getTokenFromCookie(req);
  if (!token) { res.status(401).json({ error: 'Not authenticated.' }); return; }

  const { repo } = req.query;
  if (!repo)  { res.status(400).json({ error: 'Missing ?repo= param.' }); return; }

  // Validate repo format (username/reponame) to prevent path injection
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    res.status(400).json({ error: 'Invalid repo format.' });
    return;
  }

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/progress.json`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept:        'application/vnd.github.v3+json',
          'User-Agent':  'DSA-Tracker',
        },
      }
    );

    if (ghRes.status === 404) {
      res.status(200).json({ data: null, sha: null });
      return;
    }
    if (!ghRes.ok) {
      const body = await ghRes.text();
      console.error('GitHub load error:', ghRes.status, body);
      res.status(ghRes.status).json({ error: `GitHub API error: ${ghRes.status}` });
      return;
    }

    const file   = await ghRes.json();
    const raw    = Buffer.from(file.content, 'base64').toString('utf-8');
    const parsed = JSON.parse(raw);

    res.status(200).json({ data: parsed, sha: file.sha });
  } catch (err) {
    console.error('api/load error:', err);
    res.status(500).json({ error: 'Failed to load progress.' });
  }
}
