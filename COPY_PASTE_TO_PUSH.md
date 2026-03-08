# Copy-paste to push

## 1. Git commands (run in repo root)

```bash
cd /Users/ghaziabdullah/admin-dashboard

git add vercel.json frontend-admin-dashboard/admin-dashboard-frontend/src/api/apiOrigin.js frontend-admin-dashboard/admin-dashboard-frontend/src/pages/Login.jsx "api/[...path].js"

git status

git commit -m "fix: Vercel proxy for /api/* and never use localhost in production"

git push origin main
```

**Alternative – add all changes:**

```bash
cd /Users/ghaziabdullah/admin-dashboard
git add -A
git status
git commit -m "fix: Vercel proxy for /api/* and never use localhost in production"
git push origin main
```

If your branch is not `main`, use your branch name, e.g. `git push origin master`.

---

## 2. If you need to recreate files – paste these

### `vercel.json` (repo root)

```json
{
  "buildCommand": "cd frontend-admin-dashboard/admin-dashboard-frontend && npm install --no-audit && npm run build:vercel",
  "outputDirectory": "frontend-admin-dashboard/admin-dashboard-frontend/build",
  "framework": "create-react-app",
  "rewrites": [
    { "source": "/health", "destination": "/api/health" },
    { "source": "/api/:path*", "destination": "/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### `frontend-admin-dashboard/admin-dashboard-frontend/src/api/apiOrigin.js`

```javascript
/**
 * Single source of truth for backend origins.
 * - getBackendOrigin: admin-dashboard backend (port 5000 / Railway). Used by axiosClient, superAdmin, guardMessaging.
 * - getGuardAiOrigin: abe-guard-ai backend (port 4000). Used for asset links in Inspections, Payroll, Incidents.
 */
const DEFAULT_PRODUCTION_ORIGIN = "https://admin-dashboard-production-2596.up.railway.app";
const STORAGE_KEY = "adminApiUrl";

export function getBackendOrigin() {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored.trim()) {
        const base = stored.trim().replace(/[\/?]+$/, "");
        return base.endsWith("/api/admin") ? base.replace(/\/api\/admin\/?$/, "") : base;
      }
    } catch (_) {}
  }
  const hostname = typeof window !== "undefined" && window.location?.hostname;
  // Local dev only: use localhost backend
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:5000";
  }
  // Any other host (Vercel, custom domain, etc.): use same-origin so /api/* goes through proxy or same host. Never use localhost.
  if (hostname) {
    return "";
  }
  if (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/[\/?]+$/, "");
  }
  return "";
}

/** abe-guard-ai backend origin for asset URLs (uploads, inspections, pay stubs). Set REACT_APP_GUARD_AI_URL in production. */
export function getGuardAiOrigin() {
  if (typeof process !== "undefined" && process.env?.REACT_APP_GUARD_AI_URL) {
    return String(process.env.REACT_APP_GUARD_AI_URL).replace(/[\/?]+$/, "");
  }
  if (typeof window !== "undefined" && (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1")) {
    return "http://localhost:4000";
  }
  return "";
}
```

### `api/[...path].js` (repo root – file name is literally `[...path].js` inside `api/`)

```javascript
/**
 * Vercel catch-all: forwards /api/* and /api/health (rewritten from /health) to Railway.
 * Path segments are in req.query.path (e.g. ["admin", "login"] for /api/admin/login).
 *
 * Env (Vercel): RAILWAY_BACKEND_URL = https://admin-dashboard-production-2596.up.railway.app
 */

const BACKEND = process.env.RAILWAY_BACKEND_URL || "https://admin-dashboard-production-2596.up.railway.app";
const TIMEOUT_MS = 25000;

const FORWARD_HEADERS = [
  "authorization",
  "content-type",
  "cookie",
  "accept",
  "accept-language",
];

export default async function handler(req, res) {
  const pathSegments = req.query.path;
  if (!pathSegments || !Array.isArray(pathSegments) || pathSegments.length === 0) {
    res.status(400).json({ error: "Proxy: no path segments." });
    return;
  }

  // /health is rewritten to /api/health → path = ["health"]; backend expects /health not /api/health
  const backendPath =
    pathSegments.length === 1 && pathSegments[0] === "health"
      ? "/health"
      : "/api/" + pathSegments.join("/");

  const qs = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const url = `${BACKEND.replace(/\/+$/, "")}${backendPath}${qs}`;

  const headers = {};
  FORWARD_HEADERS.forEach((h) => {
    const v = req.headers[h] || req.headers[h.toLowerCase()];
    if (v) headers[h] = v;
  });
  if (!headers["content-type"]) headers["content-type"] = "application/json";

  let body;
  if (req.method !== "GET" && req.method !== "HEAD" && req.body != null) {
    body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: req.method || "GET",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(to);
    const contentType = response.headers.get("Content-Type");
    const text = await response.text();
    res.status(response.status);
    if (contentType) res.setHeader("Content-Type", contentType);
    res.send(text);
  } catch (err) {
    clearTimeout(to);
    const code = err.name === "AbortError" ? 504 : 502;
    res.status(code).json({
      error: err.name === "AbortError" ? "Backend timeout" : "Backend unreachable",
      message: err.message || String(err),
    });
  }
}
```

---

## 3. After push

1. In **Vercel** → Deployments → **Redeploy** (with “Redeploy with existing Build Cache disabled” if available).
2. Test in **incognito**:  
   - `https://admin-dashboard-frontend-flax.vercel.app/api/admin` → should return `{"ok":true,"service":"admin-api",...}`  
   - Login → Network tab should show POST to `.../api/admin/login` (same host), not localhost.
