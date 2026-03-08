# Recommendation: Vercel API Proxy Architecture

## Verdict: **Recommend with corrections**

The **proxy-through-Vercel** approach is a solid, production-style fix for CORS, env bugs, and localhost leaks. Use it **with the fixes below**; the original snippet has a few bugs that would break login and auth.

---

## What’s good about the advice

| Point | Why it helps |
|-------|------------------|
| **Browser → Vercel → Railway** | Same-origin for the browser → no CORS. |
| **No API URL in frontend** | Frontend always calls `/api/...`; no build-time env or localhost. |
| **WebSocket direct to Railway** | Correct: serverless can’t hold WebSocket; keep `io(Railway)` or your gateway. |
| **Health, timeout, retry** | Good production hardening. |
| **Single gateway** | One place to add auth, logging, rate limits later. |

---

## What to fix before implementing

### 1. **Path forwarding is wrong**

Suggested code:

```javascript
const url = backend + req.url.replace("/api","");
```

That turns `/api/admin/login` into `https://railway.app/admin/login`.  
Your backend expects **`/api/admin/login`** (see `server.js`: `app.use("/api/admin", ...)`).

**Do this instead:** forward the full path:

```javascript
const path = req.url.startsWith("/") ? req.url : `/${req.url}`;
const url = `${backend}${path}`;
```

So Railway receives `https://railway.app/api/admin/login`.

### 2. **Headers must be forwarded**

Login and most routes need:

- **Authorization** (Bearer token)
- **Cookie** (if you use cookies)
- **Content-Type**

Otherwise auth and body parsing break. Copy through all relevant headers (or at least these) from `req.headers` to the `fetch` to Railway.

### 3. **Request body**

For POST/PUT/PATCH, the body must be forwarded. In Vercel serverless, `req.body` may already be parsed. Use a raw body if your backend expects one, or re-serialize `req.body` and send it in `fetch` (and set `Content-Type`).

### 4. **Vercel route that catches all `/api/*`**

A single file `api/proxy.js` only gets requests to **`/api/proxy`**, not `/api/admin/login`.  
You need either:

- A **catch-all** serverless function (e.g. `api/[[...path]].js`), and in the handler build the path from the `path` param and forward as above, or  
- A **rewrite** so that e.g. `/api/(.*)` is handled by one function that can read the original path (e.g. from `req.url` or a header Vercel sets).

So: use a catch-all handler **or** a rewrite that preserves the path; don’t assume `api/proxy.js` receives every `/api/*` request by default.

### 5. **`vercel.json`**

- Prefer **`rewrites`** (current Vercel style) over **`routes`**.
- Order matters: put the **API rewrite first** (e.g. `/api/:path*` → your proxy), then the SPA fallback (e.g. `/(.*)` → `index.html` or your build output).  
Otherwise the SPA rule can catch `/api/admin/login` and return the app instead of the proxy.

---

## Recommended shape of the solution

1. **Add a single proxy serverless function** that:
   - Reads the **full path** from the request (e.g. `req.url` or from catch-all params).
   - Forwards to `BACKEND_URL + path` (no stripping of `/api`).
   - Forwards method, body, and headers (at least Authorization, Cookie, Content-Type).
   - Uses a timeout (e.g. 15–30s) and returns status + body from Railway.

2. **Vercel config**
   - Rewrite `/api/:path*` (or equivalent) to that proxy so **all** `/api/*` traffic goes through it.
   - Keep your existing build command and output directory; add this rewrite **before** the SPA catch-all.

3. **Frontend**
   - When the app is served from your Vercel host (same origin), use **relative** `/api` (no Railway URL).  
   - So: if `window.location.origin` is your Vercel domain, `getBackendOrigin()` should return `""` so `axiosClient` and the rest use `/api/admin`, etc.  
   - No need to change every call site if you already have a single place (e.g. `apiOrigin.js`) that returns origin; just make it return `""` when on Vercel.

4. **WebSockets**
   - Keep connecting **directly to Railway** (or your WebSocket gateway), not through Vercel.  
   - Add reconnection options as suggested (e.g. `reconnection: true`, `reconnectionAttempts: 10`, `reconnectionDelay: 2000`).

5. **Backend**
   - Keep `/health` (you have it).  
   - Optional: add a timeout in the proxy (e.g. 15s) and retry logic in the client (e.g. `axios-retry`).

---

## Summary

- **Adopt the architecture:** Browser → Vercel (proxy) → Railway for REST; Browser → Railway (or gateway) for WebSockets.
- **Fix path forwarding** (full path, no `replace("/api","")`), **forward headers and body**, and **wire all `/api/*` to the proxy** via a catch-all or correct rewrite.
- Then set the frontend to use same-origin `/api` when on Vercel, and keep WebSockets and “instant fix” improvements as optional next steps.

---

## Implemented in this repo

- **`api/proxy.js`** — Corrected proxy that:
  - Forwards **full path** to Railway (no stripping `/api`).
  - Forwards **Authorization, Cookie, Content-Type, Accept**.
  - Forwards **body** for non-GET; 25s timeout; returns 502/504 on failure.
- **Vercel env:** Set `RAILWAY_BACKEND_URL` in Vercel (e.g. `https://admin-dashboard-production-2596.up.railway.app`). Optional; proxy has a default.

### vercel.json (root)

Put the **API rewrite first** so `/api/*` and `/health` hit the proxy; then the SPA fallback:

```json
{
  "buildCommand": "cd frontend-admin-dashboard/admin-dashboard-frontend && npm install --no-audit && npm run build:vercel",
  "outputDirectory": "frontend-admin-dashboard/admin-dashboard-frontend/build",
  "framework": "create-react-app",
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/proxy" },
    { "source": "/health", "destination": "/api/proxy" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

When the source is `/api/:path*`, Vercel may pass the segment to the function (e.g. as query). The proxy uses `req.url` first, then `req.query.__path` / `req.query.path`, and builds the backend path as `/api/...` when needed.

### Frontend: use same-origin when on Vercel

So that all REST calls go through the proxy (same origin), the frontend must use **relative** `/api` when the app is served from your Vercel domain. In **`src/api/apiOrigin.js`**, make `getBackendOrigin()` return `""` when the host is your Vercel host (e.g. `admin-dashboard-frontend-flax.vercel.app`), so that:

- `axiosClient` and others use `baseURL: "/api/admin"` or relative paths.
- Requests go to `https://<vercel-host>/api/admin/...` and Vercel forwards them to Railway.

Add at the top of `getBackendOrigin()` (after the `STORAGE_KEY` / localStorage check if you want to allow override):

```javascript
// When deployed on Vercel, use same-origin so the Vercel proxy handles /api/*
const vercelHost = "admin-dashboard-frontend-flax.vercel.app";
if (typeof window !== "undefined" && window.location?.hostname === vercelHost) {
  return "";
}
```

Then redeploy the frontend and test: login should hit `https://<vercel-host>/api/admin/login` (no CORS, no Railway URL in the browser).
