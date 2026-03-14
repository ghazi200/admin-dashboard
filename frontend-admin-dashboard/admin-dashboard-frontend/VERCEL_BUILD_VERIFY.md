# If the deployed app still uses ws://localhost:4000

The **source code in this folder** already forces the socket to Railway when the app runs on Vercel. If the live site still tries `ws://localhost:4000` and shows "Admin realtime socket" / "abe-guard-ai", then **Vercel is not building from this repo** (or not from the right branch/folder).

## 1. Check in Vercel Dashboard

**Project → Settings → Git**

- **Repository** must be the one you push to (e.g. `ghazi200/admin-dashboard`). Not a fork or copy.
- **Production Branch** must be the branch you push (e.g. `main`).

**Project → Settings → General**

- **Root Directory**:  
  - Either **leave empty** (so the root `vercel.json` is used and it runs `cd frontend-admin-dashboard/admin-dashboard-frontend && ...`),  
  - Or set to **`frontend-admin-dashboard/admin-dashboard-frontend`** (so this app’s `vercel.json` is used).  
- It must **not** be e.g. `frontend-guard-ui` or `frontend-admin-dashboard` (without `admin-dashboard-frontend`).

## 2. Clear cache and redeploy

**Deployments → … on latest → Redeploy**

- Turn **on** “Clear build cache and redeploy”.
- Wait for the build to finish.

## 3. Confirm the new code is in the bundle

After the new deploy:

1. Open **https://admin-dashboard-frontend-flax.vercel.app/reports** in an **incognito** window (or hard refresh).
2. Open DevTools → **Console**.
3. Look for: **`[socket] Using Railway gateway (Vercel build v2)`**.

- If you **see** that message: the new socket code is running. The WebSocket should go to Railway; if it still fails, the problem is network/CORS or the gateway, not the URL.
- If you **do not** see it: the browser is still running an old bundle. Check Root Directory and repo again, clear cache, and redeploy.

## 4. Check which main.*.js is loaded

In DevTools → **Network** → reload → select the **main.***.js** file.

- If the filename (e.g. `main.b3c79fbb.js`) **does not change** after a “Clear cache and redeploy”, the new build is not being served (wrong project, cache, or CDN).
