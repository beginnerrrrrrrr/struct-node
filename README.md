# DSA Sheet

> A personal, zero-dependency competitive programming tracker. Your progress lives in *your own* GitHub repo.
> Currently, I am using SDE Sheet of Jay Bansal.

---

## Why this exists

I wanted something that:

- Lives at a URL I control
- Stores progress in a format I can read and grep (plain JSON)
- Lets me write and save actual solution code, not just tick boxes
- Looks good enough that I actually open it

So I built this.

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

## Usage Guide

### Tracking progress
- Click the circle to cycle: `todo → solved → review → skip`
- Or pick from the dropdown
- Click the name to edit → Enter to save

### Writing solutions
- Click `</>` to open the editor
- Choose language → write → **Save**

### Reset
| Action | Status | Code | Resources | Notes |
|---|---|---|---|---|
| Reset section | todo | cleared | kept | kept |
| Reset topic | todo | cleared | kept | kept |
| Reset all | todo | cleared | kept | kept |
| Mark done | done | unchanged | kept | kept |

### Adding problems
- Use `+ add` → paste URL → add

### Filters & search
- Filter by status
- Use topic tabs
- Search works across everything

### Data
- Stored at `github.com/your-username/dsa-sheet/blob/main/progress.json`
- Version-controlled, portable

---

## Tech

- **Frontend**: Vanilla JS, CSS, Canvas API
- **Editor**: Monaco Editor 0.44 (VS Code's editor, via CDN)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Auth**: GitHub OAuth 2.0
- **Storage**: GitHub Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`)

---
