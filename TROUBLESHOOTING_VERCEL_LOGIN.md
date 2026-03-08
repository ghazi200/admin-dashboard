# Troubleshooting: Login / "No request headers" on Vercel

## What you might see

In DevTools → Network, a row like:

- **URL:** `https://admin-dashboard-frontend-flax.vercel.app/login`
- **Status:** —
- **Request:** No request headers  
- **Response:** No response headers  

That usually means one of two things.

---

## 1. You’re looking at the **page** request (document)

- **URL:** `.../login` is the **document** (the HTML for the login page).
- **No status/headers** can mean:
  - Request was **blocked** (extension, privacy setting, or mixed content).
  - Request **failed** before a response (e.g. network error, DNS).
  - **404**: Vercel didn’t serve `index.html` for `/login` (SPA rewrite not applied).

**What to do:**

- In Network, filter by **Doc** or **All** and check the **first** request (the one to `.../login`). Note its **Status** (200, 404, blocked, etc.).
- If it’s **404**: In Vercel → Project Settings → General, set **Framework Preset** to **Create React App** (or **Other** if you use a custom build). Ensure root **vercel.json** has the SPA rewrite: `{ "source": "/(.*)", "destination": "/index.html" }` and that it’s **after** any API rewrites. Redeploy.
- If it’s **blocked**: Try another browser or incognito; disable extensions that block requests.

---

## 2. You’re looking at the **login API** request (POST)

- The **login form** sends a **POST** to **`/api/admin/login`** (same origin when using the proxy).
- If that row shows **no request/response headers** and **no status**, the request may have been **blocked** or **not sent** (e.g. CORS, mixed content, or a JS error before `fetch`).

**What to do:**

- In Network, find the **POST** request whose URL is **`.../api/admin/login`** (not `.../login`).
- If there is **no** such request: something stopped the form from submitting (e.g. JS error, or “Use Railway backend” / validation). Check Console for errors.
- If the POST exists but shows **Status: (failed)** or **blocked**: same-origin requests to `.../api/admin/login` should not be blocked by CORS. Check Console and try incognito.

---

## After the latest changes

- **Login** now uses the **same-origin proxy** on Vercel: the POST goes to `https://admin-dashboard-frontend-flax.vercel.app/api/admin/login`, and Vercel forwards it to Railway.
- So you should see a **POST** to **`/api/admin/login`** (same host as the page), with **Status 200** (or 401 if credentials are wrong), not a request directly to Railway or localhost.

If the **document** request to `.../login` still has no status/headers, focus on the SPA rewrite and Framework Preset above; if the **API** request to `.../api/admin/login` is missing or blocked, check Console and network filters.
