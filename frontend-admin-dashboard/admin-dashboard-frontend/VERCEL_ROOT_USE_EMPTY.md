# Fix: "Root Directory does not exist"

Vercel says `frontend-admin-dashboard/admin-dashboard-frontend` does not exist. Use the repo root instead — your **root** `vercel.json` already builds the frontend.

---

## Do this in Vercel

1. **Settings** → **General** → **Root Directory**
2. **Clear the field completely** (leave it **empty** / blank).
3. **Save**.

Do **not** enter any path. With Root Directory empty, Vercel will:

- Clone the repo from the root.
- Use the **root** `vercel.json`, which runs:
  ```bash
  cd frontend-admin-dashboard/admin-dashboard-frontend && npm install --no-audit && npm run build:vercel
  ```
- Use output from: `frontend-admin-dashboard/admin-dashboard-frontend/build`.

So the frontend (with the new socket code) is built without setting a Root Directory path.

---

## Then redeploy

- **Deployments** → **Redeploy** latest → enable **Clear cache and redeploy**.

After the build finishes, open your app and check the console for `BUILD 2025-02-06-railway-v2`.
