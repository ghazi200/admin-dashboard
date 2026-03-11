# "Not allowed to request resource" – fix

This message usually means the **browser blocked a request** (often CORS or cross-origin to localhost).

---

## What we changed

**apiOrigin.js** now **ignores** any saved `adminApiUrl` in localStorage when it points to **localhost** and you’re on a **production** host (e.g. Vercel). So even if an old value like `http://localhost:5000/api/admin` was stored, the app will use **same-origin** (`/api/admin`) and the request will go through the Vercel proxy, not to localhost.

---

## What you should do

1. **Redeploy** the frontend (so this change is live) and **hard refresh** or use **incognito** when testing.

2. **Optional: clear stored API URL**
   - Open: `https://admin-dashboard-frontend-flax.vercel.app/login`
   - DevTools → Application (Chrome) or Storage (Firefox/Safari) → Local Storage → your domain
   - Remove the key **`adminApiUrl`** if it exists (or clear site data for this origin).

3. **Check where the request goes**
   - Network tab → click Sign in.
   - Find the **POST** request for login.
   - **Request URL** should be:  
     `https://admin-dashboard-frontend-flax.vercel.app/api/admin/login`  
     and **must not** be `http://localhost:5000/...`.

4. **If it still fails**
   - If the URL is **localhost** → clear cache/storage, redeploy, try incognito again.
   - If the URL is **Vercel** (`.../api/admin/login`) but you still see "Not allowed to request resource" → check the **response status** (e.g. 502 from proxy or 403 from backend) and the **Console** for the exact error.

---

## Summary

- **Cause:** Request was going to localhost (or a blocked cross-origin URL).
- **Fix:** We ignore localStorage when it points to localhost on production and use same-origin so the proxy is used. Redeploy, clear storage/cache or use incognito, and confirm the login request goes to `.../api/admin/login` on your Vercel host.
