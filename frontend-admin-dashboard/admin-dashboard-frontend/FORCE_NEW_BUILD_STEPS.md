# Force new build and verify — same error / no test messages

You still see the old error and no test messages because the browser is loading an **old JavaScript bundle**. Use these steps to force the new one.

---

## Step 1: Push and deploy

```bash
cd /Users/ghaziabdullah/admin-dashboard
git add .
git commit -m "Build marker 2025-02-06-railway-v2 and socket localhost override"
git push origin main
```

(Use your real branch name if different.)

Wait for Vercel to finish building (Deployments tab → latest should be "Ready").

---

## Step 2: Open the RIGHT URL and clear cache

- Use the **exact** production URL from Vercel (e.g. `https://admin-dashboard-frontend-flax.vercel.app`).
- Do **not** use a preview URL unless you deployed from that branch.
- **Hard refresh:** `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac).
- Or open an **Incognito/Private** window and go to the same URL.

---

## Step 3: Check console on first load

Open **DevTools → Console** **before** or as soon as the page loads.

**If the NEW bundle is loaded** you will see as one of the first lines:

```text
 BUILD 2025-02-06-railway-v2
```
(green, bold)

Then after login, when the socket connects:

```text
🔬 SOCKET BUILD: 2025-02-06-railway-only-v1 | URL: https://generous-manifestation-production-dbd9.up.railway.app (production)
🟢 SOCKET CONNECTED ...
```

**If you still do NOT see** `BUILD 2025-02-06-railway-v2` in the console:

- The browser is still using an old bundle. Try:
  - Another hard refresh or incognito.
  - Vercel → Deployments → **Redeploy** the latest deployment with **"Clear cache and redeploy"**.
  - In DevTools → Application (Chrome) → **Clear storage** → "Clear site data" for this origin, then reload.
- Or the deployment that’s live isn’t from the repo/folder you pushed. Check:
  - Vercel → Settings → **Git** (correct repo and branch).
  - **Root Directory**: must be the folder that contains `src/index.js` and `src/realtime/socket.js` (empty if app is at repo root, or e.g. `admin-dashboard-frontend` if that’s the only subfolder with the app).

---

## Step 4: Confirm in UI (optional)

In the browser console run:

```javascript
window.__APP_BUILD_ID__
```

If you see `"2025-02-06-railway-v2"`, the new bundle is loaded. If it’s `undefined`, the old bundle is still running.
