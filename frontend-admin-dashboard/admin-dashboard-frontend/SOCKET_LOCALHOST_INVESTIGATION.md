# Deep investigation: Why production still tries ws://localhost:4000

## How the URL gets into the app

1. **Single socket entry point**  
   The only place that creates the Socket.IO connection is `src/realtime/socket.js`. Every page (Dashboard, Schedule, CommandCenter, etc.) imports `connectSocket()` from this file. There is no other `io(...)` call in the frontend.

2. **Where the URL comes from**  
   In `socket.js`, `getSocketUrl()` returns:
   - `process.env.REACT_APP_SOCKET_URL` or `process.env.REACT_APP_WS_GATEWAY_URL` (trimmed), or
   - if both are empty, the constant `WS_GATEWAY_PRODUCTION` (Railway).

3. **Create React App bakes env at build time**  
   CRA does **not** read `.env` at runtime. It uses webpack’s `DefinePlugin` to replace every `process.env.REACT_APP_*` with the **literal value** present in the environment **when you run `npm run build`**. So:
   - Whatever `REACT_APP_SOCKET_URL` or `REACT_APP_WS_GATEWAY_URL` is when Vercel runs the build is what ends up in the built JS.
   - If that value is `http://localhost:4000`, the bundle will contain that string and the browser will try to connect to `ws://localhost:4000` when the app runs on https://*.vercel.app → **blocked**.

## Root cause (why it’s still happening)

The behaviour can only persist if one of these is true:

### A. Vercel env vars point to localhost (most likely)

- In **Vercel → Project → Settings → Environment Variables**, either:
  - `REACT_APP_SOCKET_URL`, or  
  - `REACT_APP_WS_GATEWAY_URL`  
  is set to something like `http://localhost:4000` (or another localhost URL).
- That value is inlined into the bundle on every build, so production will always try to connect to localhost.

**What to do:**  
Open Vercel → this project → Settings → Environment Variables. For **Production** (and Preview if you use it):

- Remove any variable that sets the socket URL to localhost, or  
- Set:
  - `REACT_APP_WS_GATEWAY_URL` = `https://generous-manifestation-production-dbd9.up.railway.app`  
  (no trailing slash).  
  Do **not** set `REACT_APP_SOCKET_URL` to a localhost URL.

Then **Redeploy** (with “Clear build cache and redeploy” if available).

### B. Wrong build / cache / branch

- The deployment might be from an old commit, a different branch, or a cached build that was created when the code or env still used localhost.
- Then the **running** bundle is not the one you expect.

**What to do:**  
Redeploy from the correct branch after fixing env (above). Use “Clear build cache and redeploy”. Confirm in the deployment logs that the build runs from `frontend-admin-dashboard/admin-dashboard-frontend` (or your intended root).

### C. Wrong Vercel project or root directory

- The URL you open might be a different Vercel project (e.g. another app or an old copy).
- Or the project’s **Root Directory** might point at a different folder, so a different app (or an old version) is built.

**What to do:**  
Confirm in Vercel that this project’s Root Directory is the one that contains the current `src/realtime/socket.js` (e.g. empty for repo root with root `vercel.json`, or `frontend-admin-dashboard/admin-dashboard-frontend` if using that folder’s `vercel.json`).

## What does *not* cause it

- **`.env` in the repo**  
  `.env` is in `.gitignore` and is not committed. Vercel builds do not use your local `.env`.

- **Runtime config / `api-config.json`**  
  The socket URL is not read from `api-config.json` or any runtime config; it comes only from the env-based logic in `socket.js` (and the fallback constant).

- **Another file opening a socket**  
  Grep shows only `src/realtime/socket.js` calls `io(...)`. No other frontend code creates the admin socket.

- **`package.json` proxy**  
  `"proxy": "http://localhost:5000"` is only for the CRA dev server; it is not part of the production bundle.

## Recommended code fix (defence in depth)

Even if a bad env var is set on Vercel, we can avoid using it when the app is clearly not running on localhost: **at runtime, if the page is served from a non-localhost origin (e.g. vercel.app), never use a socket URL that contains `localhost` or `127.0.0.1`; use the production gateway URL instead.**  
That way the bug is fixed in code regardless of what is in Vercel Environment Variables. The next section implements this.
