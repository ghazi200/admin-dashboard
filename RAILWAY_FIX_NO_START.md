# Fix: "No start command was found" on Railway

Railway is building from the **repo root** (where there is no `package.json`), so it never finds a start command.

## Fix: Set Root Directory

You **must** set **Root Directory** for the service so Railway builds from the folder that has `package.json` and the start script.

### Steps (natural-cat or your backend service)

1. In **Railway**, open your **project**.
2. Click the **service** that is failing (e.g. **natural-cat** – Admin backend).
3. Open **Settings** (gear icon or tab).
4. Find **"Root Directory"** or **"Source"** or **"Application Root"**.
5. Enter **exactly** (no leading slash):
   - For **Admin backend:** `backend`
   - For **Guard backend:** `abe-guard-ai/backend`
6. Click **Save** or **Deploy** to apply.
7. Trigger a **Redeploy** (Deployments → ⋯ → Redeploy).

After this, Railway will run from that folder, detect `package.json`, run `npm install`, and use the start command (`npm start` or the Procfile).

---

## If you don’t see "Root Directory"

- Look under **Settings** → **Build** or **Deploy** or **General**.
- Or **Settings** → **Service** → **Root Directory**.
- Newer Railway UI may call it **"Monorepo"** or **"Root directory"** in the service config.

---

## Optional: Set start command in Railway

If you already set Root Directory and it still fails, set the start command manually:

- **Settings** → **Deploy** or **Build** → **Start Command**
- **Admin backend:** `node server.js`
- **Guard backend:** `node src/server.js`

Save and redeploy.
