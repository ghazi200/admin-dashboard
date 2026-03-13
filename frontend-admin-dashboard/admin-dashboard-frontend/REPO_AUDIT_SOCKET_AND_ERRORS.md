# Repo audit: socket and console errors

## Conclusion: **This repo does NOT contain the error**

The current admin frontend source does not contain the strings you see in the browser. The live errors come from an **old bundle** or **wrong Vercel config**.

---

## 1. Where things actually are

### Socket (WebSocket) connection

| Location | What it does |
|----------|----------------|
| **`src/realtime/socket.js`** | **Only** place that creates the admin socket (`io()`). Uses `isProd ? WS_GATEWAY_PRODUCTION : getSocketUrl()`. No localhost when host is not localhost. |
| No other file in the admin frontend calls `io()` or creates a socket. | Confirmed by repo search. |

### Console messages you see vs repo

| Message you see in browser | In admin frontend source? | Where it actually is |
|---------------------------|---------------------------|----------------------|
| `❌ Admin realtime socket connect_error` | **No** | Only in **docs** (e.g. TROUBLESHOOTING.md, DEPLOY_TO_FIX_ERRORS.md) as examples. Not in any `.js`/`.jsx`. |
| `💡 Make sure abe-guard-ai is running on port 4000` | **No** | In **backend**: `backend/src/services/calloutNotificationListener.js` (Node server). Not in frontend bundle. |
| `💡 Socket connection will retry automatically...` | **No** | Not found anywhere in repo. Likely from an **old** frontend build. |
| `ws://localhost:4000` | **No** | Current `socket.js` uses Railway when `window.location.hostname` is not localhost. No localhost URL in production path. |

So: the **current** admin frontend code does not log those messages and does not connect to localhost in production. The bundle you get in the browser is either old or built with the wrong env.

---

## 2. What the current code does

- **`src/realtime/socket.js`**
  - `isProd = window.location.hostname !== "localhost" && !== "127.0.0.1"`.
  - When `isProd` is true → `urlToConnect = WS_GATEWAY_PRODUCTION` (Railway).
  - When `isProd` is false → `getSocketUrl()` (env or same Railway fallback).
  - So in production (e.g. `admin-dashboard-frontend-flax.vercel.app`) the app should **never** use localhost for the socket.

- **`src/api/apiOrigin.js`**
  - No localhost in production; uses env or Railway.

- **`src/api/axiosClient.js`**
  - No localhost in production; uses env or Railway.

---

## 3. Why you still see the errors

Only plausible reasons:

1. **Vercel is serving an old build**
   - Wrong branch, or last deploy was from a commit before these fixes, or cache.

2. **Vercel Environment Variables**
   - If `REACT_APP_SOCKET_URL` or `REACT_APP_WS_GATEWAY_URL` is set to `http://localhost:4000`, that value is baked into the bundle at **build** time. Our runtime check (`isProd`) should still override it when the app runs on vercel.app — so if you still see localhost, the **running** code likely doesn’t have that check (i.e. old bundle).

3. **Wrong project or root**
   - The deployment might not be from this repo/app (e.g. different Vercel project or wrong Root Directory).

---

## 4. What to check on Vercel

1. **Root Directory**
   - Either **empty** (so root `vercel.json` is used and it runs `cd frontend-admin-dashboard/admin-dashboard-frontend && ...`) **or**
   - Set to **`frontend-admin-dashboard/admin-dashboard-frontend`** (so that folder’s `vercel.json` is used).
   - It must **not** point at another app (e.g. `frontend-guard-ui`).

2. **Branch**
   - Production branch (e.g. `main`) must be the one where you pushed the latest `src/realtime/socket.js` and related fixes.

3. **Environment Variables**
   - For **Production** (and Preview if used), check:
     - `REACT_APP_SOCKET_URL` – remove or set to `https://generous-manifestation-production-dbd9.up.railway.app` (no trailing slash).
     - `REACT_APP_WS_GATEWAY_URL` – same: remove or set to that Railway URL.
   - Do **not** leave either set to `http://localhost:4000`.

4. **Redeploy**
   - Trigger a new deploy and use **“Clear build cache and redeploy”** if available.
   - After deploy, open the app in an **incognito** window or do a **hard refresh** so the browser loads the new `main.*.js`.

---

## 5. Summary

- The **repo is clean**: the admin frontend does not contain the error messages or a production localhost socket URL.
- The **live** errors come from an old or wrongly built bundle, or from Vercel env/configuration.
- Fix: correct Root Directory, branch, and env vars, then clear cache and redeploy so the current `frontend-admin-dashboard/admin-dashboard-frontend` code is what gets built and served.
