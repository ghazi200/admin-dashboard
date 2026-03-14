# Admin project: Reports & Inspections fix checklist

## What’s fixed in code

### Reports page
- **No redirect on 401** when you’re on `/reports` (any 401 keeps you on the page).
- **geographicSites** is not fetched on the Reports page (avoids extra 401s).
- **Template list** uses `[].concat(...)` so `y.map is not a function` is avoided.
- **Socket** uses Railway when the app is on vercel.app (no `ws://localhost:4000` in production).

### Inspections page
- **No redirect on 401** when you’re on `/inspections`.
- **geographicSites** is not fetched on the Inspections page.
- When **REACT_APP_GUARD_AI_URL** is not set, the page still loads: it only loads guards (admin backend) and shows a banner asking you to set the env var. Sites and inspection requests are skipped so you don’t get 401s or wrong-host calls.

### Shared (axios)
- 401s from report-, notification-, geographic-, scheduled-, inspection-, or sites-related requests don’t trigger redirect to login when you’re on Reports or Inspections.

---

## Vercel (admin project only)

1. **Project:** The one that deploys **admin-dashboard-frontend-flax.vercel.app**.
2. **Root Directory:** **Empty** (so it builds from repo root and uses the admin frontend).
3. **Environment variables** (Production and Preview if you use them):
   - `REACT_APP_API_URL` = `https://admin-dashboard-production-2596.up.railway.app`
   - `REACT_APP_WS_GATEWAY_URL` = `https://generous-manifestation-production-dbd9.up.railway.app`
   - **Inspections:** `REACT_APP_GUARD_AI_URL` = your Guard AI backend URL (e.g. `https://your-guard-ai.up.railway.app`). If this is missing, Inspections will show the banner and only load guards.
4. **Redeploy:** Deployments → … → Redeploy → **Clear build cache and redeploy**.

---

## Deploy the code

From repo root:

```bash
cd /Users/ghaziabdullah/admin-dashboard

git add frontend-admin-dashboard/admin-dashboard-frontend/src/api/axiosClient.js \
  frontend-admin-dashboard/admin-dashboard-frontend/src/components/Layout.jsx

git commit -m "fix: no redirect on 401 for Inspections; skip geographicSites on Reports and Inspections"

git push origin main
```

Then in Vercel, trigger a redeploy (with clear cache) for the admin project.

---

## How to verify

- **Reports:** Open `/reports` in incognito. Page should stay visible (no redirect). In Console you should see `[socket] Using Railway gateway (Vercel build v2)` if the new build is live. No `y.map is not a function`.
- **Inspections:** Open `/inspections`. If `REACT_APP_GUARD_AI_URL` is set, sites and requests load. If not set, you see the banner and guards only; no redirect.
