# After pushing: make /api work and stop localhost

## What was fixed

1. **vercel.json** – Added rewrite so `/api/*` is handled by the proxy instead of the SPA:
   - `{ "source": "/api/:path*", "destination": "/api/:path*" }` **before** the `(.*)` → index.html rule.
   - So `/api/admin` and `/api/admin/login` hit the serverless proxy, not the React app.

2. **apiOrigin.js** – In the browser, **any host that is not localhost/127.0.0.1** now uses **same-origin** (`""`):
   - So the app **never** calls `http://localhost:5000` from Vercel (or any other production host).
   - Only when `window.location.hostname` is `localhost` or `127.0.0.1` do we use `http://localhost:5000`.

## What you must do

1. **Push** these changes to the branch Vercel deploys from (e.g. `main`).

2. **Redeploy on Vercel**
   - Deployments → latest deployment → **⋯** → **Redeploy**.
   - Check **Redeploy with existing Build Cache disabled** (or clear cache) so the new frontend bundle is built.

3. **Test in a clean environment**
   - Open the app in **Incognito/Private** (or clear site data for the Vercel domain).
   - Go to: `https://admin-dashboard-frontend-flax.vercel.app/api/admin`  
     - You should see: `{"ok":true,"service":"admin-api",...}` (from Railway via the proxy).
   - Then open: `https://admin-dashboard-frontend-flax.vercel.app/login`  
     - Sign in; in Network you should see **POST** to `.../api/admin/login` (same host), **not** localhost:5000.

4. **If it still calls localhost**
   - Hard refresh (Cmd+Shift+R / Ctrl+Shift+R) or clear cache for the site.
   - Confirm in Vercel that the **latest** commit (with these changes) was deployed and that the build used the updated files.
