/* =====================================================================
   api/load.js  —  Vercel Serverless Function
   Reads progress.json from the user's GitHub repo (username/dsa-sheet).

   Request:
     GET /api/load?repo=username/dsa-sheet
     Authorization: Bearer <github_token>   (set by frontend)

   Response:
     { data: <parsed JSON or null>, sha: "<file SHA or null>" }
   ===================================================================== */

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const { repo } = req.query;

  if (!token) { res.status(401).json({ error: 'Missing Authorization header.' }); return; }
  if (!repo)  { res.status(400).json({ error: 'Missing ?repo= query param.' });   return; }

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

    // File doesn't exist yet — first-time user
    if (ghRes.status === 404) {
      res.status(200).json({ data: null, sha: null });
      return;
    }

    if (!ghRes.ok) {
      const errorBody = await ghRes.text();
      console.error('GitHub load error:', ghRes.status, errorBody);
      res.status(ghRes.status).json({ error: `GitHub API error: ${ghRes.status}` });
      return;
    }

    const file = await ghRes.json();

    // GitHub returns content as base64
    const raw     = Buffer.from(file.content, 'base64').toString('utf-8');
    const parsed  = JSON.parse(raw);

    res.status(200).json({ data: parsed, sha: file.sha });
  } catch (err) {
    console.error('Load handler error:', err);
    res.status(500).json({ error: 'Failed to load progress from GitHub.' });
  }
}
