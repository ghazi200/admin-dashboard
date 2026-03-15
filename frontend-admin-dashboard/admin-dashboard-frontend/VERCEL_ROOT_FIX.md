# Vercel "Root Directory does not exist" — Fix

Vercel says:  
`The specified Root Directory "frontend-admin-dashboard/admin-dashboard-frontend" does not exist.`

That means the **Git repository connected to your Vercel project** does not have that path. So we need to use the path that **your** repo actually has.

---

## Step 1: See which repo Vercel uses

1. Vercel Dashboard → your project → **Settings** → **Git**.
2. Note **Connected Git Repository** (e.g. `your-username/admin-dashboard` or `your-username/admin-dashboard-frontend`).

---

## Step 2: Try these Root Directory values

In **Settings** → **General** → **Root Directory**, try **one** of these (then Save and redeploy):

### Option A — Leave Root Directory **empty**

- Use this if the repo you connected is **only** this app (when you open the repo on GitHub you see `package.json`, `src/`, `public/` at the **top level**).
- So: clear the Root Directory field completely and leave it blank.

### Option B — Use only the inner folder name

- If when you open the repo on GitHub you see **one folder** (e.g. `admin-dashboard-frontend`) and the app is inside it, set:
  ```text
  admin-dashboard-frontend
  ```
- So: Root Directory = `admin-dashboard-frontend` (no `frontend-admin-dashboard/` in front).

### Option C — Repo root is “admin-dashboard” and has “frontend-admin-dashboard”

- If the repo root has a folder `frontend-admin-dashboard`, and inside that you have `admin-dashboard-frontend`, then the full path from repo root is:
  ```text
  frontend-admin-dashboard/admin-dashboard-frontend
  ```
- You said this didn’t exist — so your repo is probably **not** this structure (or the folder names are different).

---

## Step 3: Confirm what’s in the repo root

On **GitHub** (or wherever the connected repo lives):

1. Open the repo.
2. Look at the **root** (first level of files and folders).
3. You need to find the folder that contains:
   - `package.json` (with `"name": "admin-dashboard-frontend"`)
   - `src/realtime/socket.js`
   - `vercel.json`

Then set **Root Directory** in Vercel to the path from repo root to that folder:

- If that folder **is** the repo root → leave Root Directory **empty**.
- If that folder is e.g. `admin-dashboard-frontend` at root → set Root Directory to `admin-dashboard-frontend`.
- If it’s inside another folder, set the full path (e.g. `some-parent/admin-dashboard-frontend`).

---

## Most likely in your case

If you have a **separate** repo that only holds this frontend app (so the repo root is already `package.json` + `src/`), then:

- **Root Directory:** leave **empty**.

Then redeploy with **Clear cache and redeploy**. After that, the build should see your updated `socket.js` and you should get the new build and no `ws://localhost:5000`.
