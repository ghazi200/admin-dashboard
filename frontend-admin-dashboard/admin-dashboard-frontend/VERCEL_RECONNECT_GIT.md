# Reconnect Vercel to the Correct GitHub Project

Do this so Vercel builds from **ghazi200/admin-dashboard** and finds **frontend-admin-dashboard**.

---

## Step 1: Disconnect current Git (if any)

1. Go to **Vercel Dashboard** → your project (admin dashboard frontend).
2. **Settings** → **Git**.
3. Under **Connected Git Repository**, click **Disconnect** (or **Disconnect Repository**).
4. Confirm. The project will stay deployed but will no longer auto-deploy on push.

---

## Step 2: Connect to the correct repo

1. Still in **Settings** → **Git**.
2. Click **Connect Git Repository** (or **Connect**).
3. Choose **GitHub** (authorize if asked).
4. Select the repo: **ghazi200/admin-dashboard**.
   - If you don’t see it, use **Configure GitHub App** and allow Vercel access to the org/user that owns the repo.
5. Pick the **Production Branch**: **main**.
6. Confirm / **Save**.

Vercel is now linked to **ghazi200/admin-dashboard**, **main** branch.

---

## Step 3: Set Root Directory

1. Go to **Settings** → **General**.
2. Find **Root Directory**.
3. Click **Edit** and set to:
   ```text
   frontend-admin-dashboard
   ```
4. **Save**.

(One level only; the `frontend-admin-dashboard/vercel.json` in the repo runs the build from `admin-dashboard-frontend`.)

---

## Step 4: Trigger a new deploy

**Option A – Redeploy**

- **Deployments** → open **⋮** on the latest deployment → **Redeploy**.
- Enable **Clear cache and redeploy** if shown.

**Option B – Push to trigger deploy**

```bash
cd /Users/ghaziabdullah/admin-dashboard
git add .
git commit -m "Trigger deploy after reconnecting Git"
git push origin main
```

Vercel will build from **ghazi200/admin-dashboard** → **main** → **frontend-admin-dashboard** (Root Directory).

---

## Checklist

| Step | Action |
|------|--------|
| 1 | Settings → Git → **Disconnect** current repo |
| 2 | **Connect Git Repository** → GitHub → **ghazi200/admin-dashboard** → branch **main** |
| 3 | Settings → General → **Root Directory** = `frontend-admin-dashboard` → Save |
| 4 | Deployments → **Redeploy** (or push to main) |

After the new deployment, open the app and in the browser console run `window.__APP_BUILD_ID__` — you should see `"2025-02-06-railway-v2"` if the new build is live.
