/* =====================================================================
   api/save.js  —  Vercel Serverless Function
   Writes progress.json to the user's GitHub repo (creates repo if needed).
   Auth token is read from the httpOnly cookie — never from the client.

   Request:  POST /api/save
             Body: { repo: "user/dsa-sheet", sha: "<sha|null>", data: {...} }
   Response: { sha: "<new SHA>" }
   ===================================================================== */

function getTokenFromCookie(req) {
  const raw   = req.headers.cookie || '';
  const match = raw.match(/(?:^|;\s*)gh_token=([^;]+)/);
  return match ? match[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const token = getTokenFromCookie(req);
  if (!token) { res.status(401).json({ error: 'Not authenticated.' }); return; }

  const { repo, sha, data } = req.body || {};
  if (!repo) { res.status(400).json({ error: 'Missing repo.' }); return; }
  if (!data) { res.status(400).json({ error: 'Missing data.' }); return; }

  // Validate repo format
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    res.status(400).json({ error: 'Invalid repo format.' });
    return;
  }

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept:        'application/vnd.github.v3+json',
    'Content-Type':'application/json',
    'User-Agent':  'DSA-Tracker',
  };

  try {
    // Auto-create the repo on the very first save
    if (!sha) {
      const repoName = repo.split('/')[1] || 'dsa-sheet';
      const checkRes = await fetch(`https://api.github.com/repos/${repo}`, { headers: ghHeaders });
      if (checkRes.status === 404) {
        await fetch('https://api.github.com/user/repos', {
          method:  'POST',
          headers: ghHeaders,
          body:    JSON.stringify({
            name:        repoName,
            description: 'DSA progress tracker data',
            private:     true,
            auto_init:   true,
          }),
        });
        // Brief pause for GitHub to initialise the repo
        await new Promise(r => setTimeout(r, 900));
      }
    }

    const content    = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const putPayload = { message: 'chore: update DSA progress', content };
    if (sha) putPayload.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/progress.json`,
      { method: 'PUT', headers: ghHeaders, body: JSON.stringify(putPayload) }
    );

    if (!putRes.ok) {
      const errBody = await putRes.text();
      console.error('GitHub write error:', putRes.status, errBody);
      res.status(putRes.status).json({ error: `GitHub API error: ${putRes.status}` });
      return;
    }

    const result = await putRes.json();
    res.status(200).json({ sha: result.content?.sha });
  } catch (err) {
    console.error('api/save error:', err);
    res.status(500).json({ error: 'Failed to save progress.' });
  }
}
