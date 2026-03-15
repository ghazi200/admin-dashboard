# Why "Root Directory does not exist" + Fix with ONE level

## Why Vercel might not find the path

1. **Wrong repo** – The project may be connected to a repo where the app is at the **root** (no `frontend-admin-dashboard` folder). Then `frontend-admin-dashboard/admin-dashboard-frontend` doesn’t exist there.
2. **Two-level path** – Some setups only accept a **single** folder in Root Directory (e.g. `frontend-admin-dashboard`), not two (`frontend-admin-dashboard/admin-dashboard-frontend`).
3. **Branch** – The branch Vercel builds from might not have that path (e.g. old or different structure).

---

## Fix: use only ONE folder in Root Directory

A **vercel.json** was added in **frontend-admin-dashboard/** (parent folder). It runs the build from **admin-dashboard-frontend** and sets the output directory.

**In Vercel:**

1. **Settings** → **General** → **Root Directory**
2. Set it to **only** (one level, no slash at end):
   ```text
   frontend-admin-dashboard
   ```
3. **Save**
4. **Deployments** → **Redeploy** (with **Clear cache and redeploy** if available)

So:

- Vercel’s Root Directory = **frontend-admin-dashboard** (one level).
- That folder’s **vercel.json** runs: `cd admin-dashboard-frontend && npm install && npm run build:vercel` and uses **admin-dashboard-frontend/build** as output.

If Vercel still says **frontend-admin-dashboard** does not exist, then the connected repo almost certainly doesn’t have that folder (e.g. it’s a repo that only has the app at root). In that case leave Root Directory **empty** and rely on the **repo root** vercel.json (which already has the full path in its build command).
