# Fix live errors: deploy the latest frontend

The errors you see (**Admin realtime socket connect_error**, **y.map is not a function**, **WebSocket closed before connection**) come from an **old JavaScript bundle** (`main.ac4e5747.js`). The fixes are already in the code; the live site must serve a **new build**.

## 1. Push and deploy (Vercel will build)

From your project root (e.g. `admin-dashboard`), run:

```bash
cd /Users/ghaziabdullah/admin-dashboard
git add -A
git status
git commit -m "fix: reports templates array, guard socket only when env set, inspections/incidents"
git push
```

If your repo uses a different branch (e.g. `master`):

```bash
git push origin main
# or
git push origin master
```

## 2. Wait for Vercel

- Open the Vercel dashboard → your project → **Deployments**.
- Wait until the latest deployment shows **Ready** (new build will have a different `main.*.js` hash, not `ac4e5747`).

## 3. Hard refresh

- On the live site: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows/Linux), or clear cache for the site.

## 4. (Optional) Vercel env

To avoid the guard socket entirely in production, **do not** set `REACT_APP_GUARD_REALTIME_URL` in Vercel.  
To use the admin socket in production, set:

- `REACT_APP_ADMIN_REALTIME_URL` = `https://admin-dashboard-production-2596.up.railway.app`

Then trigger a **Redeploy** so the new env is used.
