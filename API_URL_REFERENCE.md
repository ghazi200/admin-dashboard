# API URL reference – correct paths (no “api-app-admin”)

The correct path prefix is **`/api/admin`** (slash between `api` and `admin`). There is no **`api-app-admin`** in this project.

---

## Backend (Railway) – what the server expects

Defined in **`backend/server.js`**:

| Path | Method | Purpose |
|------|--------|---------|
| **/api/admin** | GET | Health/info (returns `{ ok: true, service: "admin-api", ... }`) |
| **/api/admin/login** | POST | Login (body: `{ email, password }`) |
| **/api/admin/register** | POST | Register |
| **/api/admin/dashboard** | (various) | Dashboard routes |
| **/api/admin/guards** | (various) | Guards |
| **/api/admin/messages** | (various) | Messages |
| **/api/admin/notifications** | (various) | Notifications |
| **/api/super-admin** | (various) | Super-admin (tenants, etc.) |
| **/api/guard/messages** | (various) | Guard messaging |
| **/health** | GET | Backend health (no `/api` prefix) |

So all admin API routes are under **`/api/admin/...`** (and a few under `/api/super-admin`, `/api/guard/...`).

---

## Frontend – what the app calls

| Where | Path used | Correct? |
|-------|-----------|-----------|
| **Login (fetch)** | `apiBase + "/login"` → **`/api/admin/login`** | ✅ |
| **axiosClient** | `baseURL = ".../api/admin"`, paths like `"/login"` → **`/api/admin/login`** | ✅ |
| **superAdmin.js** | **`/api/super-admin`** (e.g. `/api/super-admin/tenants`) | ✅ |
| **guardMessaging.service.js** | **`/api/guard/messages`** | ✅ |
| **api-config.json** | `adminApiUrl`: `.../api/admin` | ✅ |

So the frontend uses **`/api/admin`** (and `/api/super-admin`, `/api/guard/...`) and never **`api-app-admin`**.

---

## Vercel proxy – how the path is built

File: **`api/[...path].js`**.

- Request from browser: **`https://admin-dashboard-frontend-flax.vercel.app/api/admin/login`**
- Vercel invokes the catch-all with path segments after `/api/`: **`["admin", "login"]`**
- Proxy builds:  
  `backendPath = "/api/" + pathSegments.join("/")` → **`/api/admin/login`**
- Proxy forwards to Railway:  
  **`https://admin-dashboard-production-2596.up.railway.app/api/admin/login`**

So the proxy forwards **`/api/admin/...`** (and other `/api/...` paths) correctly; there is no **api-app-admin** anywhere.

---

## Quick checks you can run

1. **Backend (Railway) – admin API exists**  
   ```bash
   curl -s https://admin-dashboard-production-2596.up.railway.app/api/admin
   ```  
   Expect: `{"ok":true,"service":"admin-api",...}`

2. **Backend – login endpoint exists**  
   ```bash
   curl -s -X POST https://admin-dashboard-production-2596.up.railway.app/api/admin/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@test.com","password":"password123"}'
   ```  
   Expect: JSON (e.g. `token` or `message` / 401).

3. **Vercel proxy – same path**  
   In the browser (on your Vercel app), open:  
   `https://admin-dashboard-frontend-flax.vercel.app/api/admin`  
   Expect: same JSON as (1) (proxy forwards to Railway).

4. **No “api-app-admin”**  
   Search the repo: there are no references to **`api-app-admin`**. The correct prefix is **`/api/admin`**.

---

## Summary

| Term | Correct? | Meaning |
|------|----------|--------|
| **/api/admin** | ✅ | Admin API prefix (backend + frontend + proxy). |
| **api-app-admin** | ❌ | Not used in this project. |
| **/api/admin/login** | ✅ | Login endpoint (POST). |

Use **`/api/admin`** and **`/api/admin/login`** everywhere; they match the backend and the proxy.
