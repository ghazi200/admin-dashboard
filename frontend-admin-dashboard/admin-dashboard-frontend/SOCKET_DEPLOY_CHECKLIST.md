# Socket still blocked (ws://localhost:4000) — deploy checklist

The code in `src/realtime/socket.js` **never** uses localhost when the app runs on a non-localhost host (e.g. your Vercel URL). If the browser still tries `ws://localhost:4000`, the **deployed bundle is old**.

## 1. Commit and push

- Save all files. From repo root:
  - `git status` — ensure `frontend-admin-dashboard/admin-dashboard-frontend/src/realtime/socket.js` is modified (or already committed).
  - `git add` and `git commit` and **push** the branch Vercel builds from (usually `main` or `master`).

## 2. Vercel project settings

- **Root Directory**:  
  - If the repo root is `admin-dashboard` (this repo), Root Directory must be either:
    - **Empty** (build uses root `vercel.json`: builds `frontend-admin-dashboard/admin-dashboard-frontend`), or  
    - **`frontend-admin-dashboard/admin-dashboard-frontend`** (build uses that folder’s `vercel.json`).  
  - Wrong Root Directory (e.g. a different app) = wrong code and old socket behavior.
- **Branch**: Production branch must be the one you pushed (e.g. `main`).

## 3. Redeploy with cache cleared

- Vercel Dashboard → your project → **Deployments** → **⋯** on latest deployment → **Redeploy**.
- Tick **“Clear build cache and redeploy”** (or equivalent), then confirm.
- Wait for the new deployment to finish.

## 4. Confirm the new bundle is loaded

- Open your **production** app URL (e.g. `https://….vercel.app`).
- Open DevTools → **Network** tab → reload. Find the main JS file (e.g. `main.xxxxx.chunk.js` or `static/js/main.….js`). Note its name/hash.
- DevTools → **Sources** (or **Debugger**) → open that same main JS file → **Search** (Ctrl/Cmd+F) for:  
  `generous-manifestation-production`
- If you **see** that string: the new socket code is in the bundle; the connection should go to Railway, not localhost. If it still blocks, the error may be from another tab or extension.
- If you **don’t** see it: the loaded bundle is still old. Try hard refresh (Ctrl/Cmd+Shift+R), or another browser/incognito, and re-check. If it’s still missing, the deployment did not build from the repo that contains the updated `socket.js` (wrong root, wrong branch, or build from wrong commit).

## 5. Optional: force no cache on the JS

In `vercel.json` you can add a header so the main JS is not cached long (helps after a redeploy):

```json
"headers": [
  {
    "source": "/static/js/(.*)",
    "headers": [
      { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
    ]
  }
]
```

After redeploying with cache cleared and confirming `generous-manifestation-production` is in the loaded main JS, the socket should no longer be blocked to localhost.
