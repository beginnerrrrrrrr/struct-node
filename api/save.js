/* =====================================================================
   api/save.js  —  Vercel Serverless Function
   Writes (creates or updates) progress.json in the user's GitHub repo.
   Also auto-creates the repo on the very first save if it doesn't exist.

   Request:
     POST /api/save
     Authorization: Bearer <github_token>   (set by frontend)
     Content-Type: application/json
     Body: { repo: "username/dsa-sheet", sha: "<sha or null>", data: { ... } }

   Response:
     { sha: "<new file SHA>" }
   ===================================================================== */

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) { res.status(401).json({ error: 'Missing Authorization header.' }); return; }

  const { repo, sha, data } = req.body;
  if (!repo) { res.status(400).json({ error: 'Missing repo in body.' }); return; }
  if (!data) { res.status(400).json({ error: 'Missing data in body.' }); return; }

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept:        'application/vnd.github.v3+json',
    'Content-Type':'application/json',
    'User-Agent':  'DSA-Tracker',
  };

  try {
    // ── Auto-create repo on very first save ──────────────────────────
    // We only attempt this when sha is null (file has never been saved).
    if (!sha) {
      const repoName = repo.split('/')[1] || 'dsa-sheet';

      // Check if repo already exists
      const checkRes = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: ghHeaders,
      });

      if (checkRes.status === 404) {
        // Repo doesn't exist — create it (private by default)
        const createRes = await fetch('https://api.github.com/user/repos', {
          method:  'POST',
          headers: ghHeaders,
          body: JSON.stringify({
            name:        repoName,
            description: 'DSA problem tracker data',
            private:     true,
            auto_init:   true,   // creates a default README so the repo is non-empty
          }),
        });
        if (!createRes.ok) {
          const errBody = await createRes.text();
          console.error('Repo creation failed:', createRes.status, errBody);
          // Don't bail out here — the PUT below will fail gracefully if the repo
          // truly couldn't be created and we'll surface that error instead.
        }
        // Give GitHub a moment to initialise the repo before we try writing to it
        await new Promise(r => setTimeout(r, 800));
      }
    }

    // ── Write progress.json ──────────────────────────────────────────
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');

    const body = {
      message: 'chore: update DSA progress',
      content,
    };
    // sha is required for updates; omit it entirely for the initial create
    if (sha) body.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/progress.json`,
      { method: 'PUT', headers: ghHeaders, body: JSON.stringify(body) }
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
    console.error('Save handler error:', err);
    res.status(500).json({ error: 'Failed to save progress to GitHub.' });
  }
}
