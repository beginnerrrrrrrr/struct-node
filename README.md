# DSA Sheet

> A personal, zero-dependency competitive programming tracker. Dark mode. Monaco editor. Animated water bowl. Your progress lives in *your own* GitHub repo, and the auth token never touches client-side JavaScript.

---

## Why this exists

Every DSA tracker I found was either a spreadsheet I'd forget to update, a SaaS product with a paywall, or a browser extension that died after 90 days. I wanted something that:

- Lives at a URL I control
- Stores progress in a format I can read and grep (plain JSON)
- Lets me write and save actual solution code, not just tick boxes
- Looks good enough that I actually open it

So I built this.

---

## What it does

| Feature | How it works |
|---|---|
| **267 curated problems** | Across 5 topics: Number Theory, Arrays/Strings/LL, Stacks/Queues/Heaps, Trees/Graphs, DP |
| **4 statuses** | `todo` → `solved` → `review` → `skip` — click the circle to cycle, or use the dropdown |
| **Monaco editor** | Full VS Code editor inside the side panel — write your solution, pick a language, save it |
| **Notes & resources** | Per-problem notes textarea + link collection. Unaffected by resets. |
| **Add custom problems** | Hit `+ add` on any section header to add your own problems to that section |
| **GitHub sync** | Progress saved as `progress.json` in your own `dsa-sheet` repo. Auto-created on first save. |
| **Secure auth** | GitHub OAuth via Vercel Functions. Token stored in an httpOnly cookie — never visible in JS or DevTools network tab. |
| **Water bowl** | Fills up as you solve problems. Click it for ripples. DPI-aware canvas — sharp at any zoom. |
| **Filters & search** | Filter by topic tab, status, or free-text search across name/URL/subtopic |
| **Collapse sections** | Click any section header to fold it. State persisted to GitHub. |

---

## Architecture

```mermaid
flowchart TD
    User(["👤 Browser"])

    subgraph Frontend ["Frontend  (static files)"]
        HTML["index.html"]
        CSS["style.css"]
        DATA["data.js\n267 problems + constants"]
        BOWL["bowl.js\ncanvas animation"]
        APP["app.js\nstate · render · UI"]
    end

    subgraph Vercel ["Vercel Serverless Functions  (api/)"]
        AUTH["api/auth.js\nRedirect → GitHub OAuth"]
        CB["api/callback.js\nExchange code → token\nSet httpOnly cookie"]
        ME["api/me.js\nRead cookie → return user info"]
        LOAD["api/load.js\nRead cookie → fetch progress.json"]
        SAVE["api/save.js\nRead cookie → write progress.json"]
        LOGOUT["api/logout.js\nClear cookie"]
    end

    subgraph GitHub ["GitHub"]
        OAUTH["OAuth Server\ngithub.com/login/oauth"]
        API["REST API\napi.github.com"]
        REPO["User Repo\nusername/dsa-sheet\n└── progress.json"]
    end

    User -->|"click login"| AUTH
    AUTH -->|"302 redirect"| OAUTH
    OAUTH -->|"code param"| CB
    CB -->|"Set-Cookie: gh_token (httpOnly)\n302 → /"| User

    User -->|"GET /api/me\n(cookie auto-sent, zero JS)"| ME
    ME -->|"Bearer token from cookie"| API
    API -->|"user object"| ME
    ME -->|"{ login, avatar_url }"| User

    User -->|"GET /api/load"| LOAD
    LOAD -->|"Bearer token from cookie"| API
    API -->|"file content + SHA"| LOAD
    LOAD -->|"{ data, sha }"| User

    User -->|"POST /api/save\n{ repo, sha, data }"| SAVE
    SAVE -->|"Bearer token from cookie"| API
    API -->|"PUT /contents/progress.json"| REPO
    SAVE -->|"{ sha }"| User

    User -->|"POST /api/logout"| LOGOUT
    LOGOUT -->|"Clear cookie + 200"| User

    style CB fill:#1a1a2e,stroke:#7c6ff7,color:#e8e8f0
    style ME fill:#1a1a2e,stroke:#3ddc97,color:#e8e8f0
    style LOAD fill:#1a1a2e,stroke:#5ba4f5,color:#e8e8f0
    style SAVE fill:#1a1a2e,stroke:#f4a94e,color:#e8e8f0
    style REPO fill:#0f3460,stroke:#a89aff,color:#e8e8f0
```

### Why the token never appears in DevTools

When you log in, GitHub sends a one-time `code` to `api/callback.js`. That function exchanges it for an access token **server-side**, then stores it in a `Set-Cookie` header with `HttpOnly; Secure; SameSite=Strict`. The browser receives the cookie but JavaScript cannot read it — `document.cookie` doesn't see it. Every subsequent call to `/api/load`, `/api/save`, `/api/me` sends the cookie automatically, and each Vercel function reads it from `req.headers.cookie`. The GitHub token is never in a request body, never in a query string, never in client-side memory.

---

## File structure

```
dsa-tracker/
├── index.html          # Markup only — ~120 lines
├── style.css           # All CSS, commented by section
├── data.js             # TOPICS[], LANG_LABELS, STATUS_*, PROBLEMS[]
├── bowl.js             # Canvas water animation (DPI-aware)
├── app.js              # All state, rendering, GitHub sync, auth UI
├── api/
│   ├── auth.js         # Redirect to GitHub OAuth
│   ├── callback.js     # Exchange code → httpOnly cookie
│   ├── me.js           # Validate session, return safe user object
│   ├── load.js         # Read progress.json from user's GitHub repo
│   ├── save.js         # Write progress.json, auto-create repo
│   └── logout.js       # Clear session cookie
├── vercel.json         # Route config + env var references
├── .env.example        # Template — copy to .env for local dev
└── .gitignore          # Keeps .env and .vercel out of git
```

---

## Setup

### 1 — Create a GitHub OAuth App

Go to **github.com → Settings → Developer Settings → OAuth Apps → New OAuth App**

| Field | Value |
|---|---|
| Application name | DSA Sheet |
| Homepage URL | `https://your-app.vercel.app` |
| Authorization callback URL | `https://your-app.vercel.app/api/callback` |

Hit **Register application**. Copy the **Client ID**. Generate and copy the **Client Secret** — you won't see it again.

### 2 — Deploy to Vercel

```bash
# Install Vercel CLI if you don't have it
npm install -g vercel

# In the project folder
vercel login
vercel

# Add secrets (do this before the first deploy or redeploy after)
vercel env add GITHUB_CLIENT_ID
vercel env add GITHUB_CLIENT_SECRET
```

Or add them in the Vercel dashboard under **Project → Settings → Environment Variables**.

### 3 — Update the callback URL

After Vercel gives you a production URL, go back to your GitHub OAuth App settings and update the **Authorization callback URL** to `https://your-actual-domain.vercel.app/api/callback`.

### 4 — Local development

```bash
cp .env.example .env
# Fill in GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
# Set APP_URL=http://localhost:3000

vercel dev
# → http://localhost:3000
```

Update the OAuth App callback URL to `http://localhost:3000/api/callback` for local dev (or create a separate OAuth App for dev).

---

## Usage guide

### Tracking progress

- **Click the circle** on the left of any row to cycle: `todo → solved → review → skip`
- Or use the **dropdown** on the right for direct selection
- **Edit the name** by clicking on it — type, then press Enter or click away

### Writing solutions

Click the `</>` button on any row to open the side panel. Pick your language from the dropdown — Monaco switches syntax highlighting automatically. Hit **save** when done.

### Reset behaviour

| Action | Status | Code | Resources | Notes |
|---|---|---|---|---|
| Reset section to todo | cleared | **cleared** | kept | kept |
| Reset topic to todo | cleared | **cleared** | kept | kept |
| Reset all to todo | cleared | **cleared** | kept | kept |
| Mark as done (any scope) | set to done | unchanged | kept | kept |

### Adding your own problems

Every section header has a `+ add` button (visible on hover). Click it, paste the URL, optionally add a name, and hit **+ add problem**. The count updates immediately. Custom problems have an `x` button to delete them.

### Filters and search

- **Status filter** (toolbar): show only solved / review / skip / todo
- **Topic tabs**: narrow to one topic. Hover the tab for reset options.
- **Search**: matches problem name, URL, subtopic, or topic name

### Data storage

Your progress lives at `github.com/your-username/dsa-sheet/blob/main/progress.json`. It's a plain JSON file — you can read it, diff it, restore old versions, or copy it between accounts. The repo is created automatically on your first save (private by default).

---

## Security notes

- The GitHub OAuth token is stored in an `httpOnly` cookie. It is completely inaccessible to JavaScript.
- `SameSite=Strict` prevents the cookie from being sent on cross-origin requests, blocking CSRF.
- `Secure` is set automatically in production (HTTPS). Local dev uses HTTP — expected.
- Repo path input is validated with `/^[\w.-]+\/[\w.-]+$/` before being passed to the GitHub API.
- `GITHUB_CLIENT_SECRET` never leaves the Vercel serverless environment.
- No analytics, no ads, no third-party scripts beyond Monaco CDN and Google Fonts.

---

## Tech

- **Frontend**: Vanilla JS, CSS custom properties, Canvas API
- **Editor**: Monaco Editor 0.44 (VS Code's editor, via CDN)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Auth**: GitHub OAuth 2.0
- **Storage**: GitHub Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`)
- **Fonts**: JetBrains Mono + Syne (Google Fonts)
- **Zero npm dependencies** in the frontend

---

*Built because spreadsheets are for accountants.*
