# Still Seeing Old Build on Vercel — Fix Checklist

If you still see `ws://localhost:5000` and **no** test messages (`🔬 SOCKET BUILD:`, `🟢 SOCKET CONNECTED`), Vercel is serving an old build. Use this checklist.

---

## 1. Which repo/folder is connected to Vercel?

You have two possible setups:

| Setup | Root in Vercel | Where your code lives |
|-------|----------------|------------------------|
| **A** | *(empty)* or `frontend-admin-dashboard/admin-dashboard-frontend` | This folder |
| **B** | Different repo or subfolder | Another path |

- In **Vercel Dashboard** → your project → **Settings** → **General** → **Root Directory**.
- It **must** point to the folder that contains `src/realtime/socket.js` (this frontend).  
  If this app lives in `frontend-admin-dashboard/admin-dashboard-frontend`, set Root Directory to:
  ```text
  frontend-admin-dashboard/admin-dashboard-frontend
  ```
  (or leave empty if the whole repo is only this app and `vercel.json` is in this folder.)

---

## 2. Correct branch and push

Vercel “Production” usually deploys from `main` (or `master`).

```bash
cd /Users/ghaziabdullah/admin-dashboard

# See current branch and status
git branch
git status

# If you're on another branch, push main too
git add .
git commit -m "Socket: Railway-only production, build id 2025-02-06-railway-only-v1"
git push origin main
```

If your default branch is different (e.g. `master`), use that name. In Vercel → **Settings** → **Git** you can see which branch is “Production”.

---

## 3. Clear Vercel cache and redeploy

Old build can come from **Vercel’s cache**.

1. Vercel Dashboard → your project.
2. Open the **Deployments** tab.
3. Click the **⋮** on the **latest** deployment.
4. Choose **Redeploy**.
5. **Enable “Clear cache and redeploy”** (or similar).
6. Confirm.

Wait for the new build to finish, then test again.

---

## 4. Confirm the new build is live (build ID)

After redeploy, open your app, **log in**, open **DevTools → Console**, and look for:

```text
🔬 SOCKET BUILD: 2025-02-06-railway-only-v1 | URL: https://generous-manifestation-production-dbd9.up.railway.app (production)
```

- If you **see** that line → new build is running. You should also see `🟢 SOCKET CONNECTED` and no `ws://localhost:5000`.
- If you **don’t** see it → still old build. Try steps 5 and 6.

---

## 5. Browser cache

Your browser may be serving old JS.

- **Hard refresh:** `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac).
- Or test in an **Incognito/Private** window.

---

## 6. Two Vercel projects?

If you have one project for the **root** repo and one for the **frontend** folder:

- The URL `https://admin-dashboard-frontend-flax.vercel.app` is tied to **one** of them.
- Make sure you’re pushing to the **repo/branch** that that project uses, and that its **Root Directory** is the folder that contains `src/realtime/socket.js` (see step 1).

---

## 7. Verify code in the repo

Ensure the socket changes are in the commit you push:

```bash
cd /Users/ghaziabdullah/admin-dashboard
git log -1 --oneline
grep -n "SOCKET_BUILD_ID\|2025-02-06-railway-only" frontend-admin-dashboard/admin-dashboard-frontend/src/realtime/socket.js
```

You should see the build id constant. If not, the latest code wasn’t committed/pushed.

---

## Summary

| Cause | What to do |
|-------|------------|
| Wrong Root Directory | Set to folder that has `src/realtime/socket.js` |
| Wrong branch | Push to the branch Vercel uses for Production |
| Cached build | Redeploy with “Clear cache and redeploy” |
| Browser cache | Hard refresh or incognito |
| Wrong project | Redeploy the project that serves that Vercel URL |

After a **cleared-cache redeploy**, you should see `🔬 SOCKET BUILD: 2025-02-06-railway-only-v1` in the console when the new build is live.
