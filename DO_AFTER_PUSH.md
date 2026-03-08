# Do these after you push (Vercel + Railway)

The repo root **vercel.json** is updated so Vercel builds the frontend subfolder. You still need to do these in the dashboards.

---

## 1. Push the change

```bash
git add vercel.json
git commit -m "Vercel: expert fix - build frontend subfolder, framework create-react-app"
git push origin main
```

---

## 2. Vercel – Root Directory

- **Vercel** → your **admin dashboard** project → **Settings** → **General**
- **Root Directory:** leave **empty** (clear the field, save)

---

## 3. Vercel – Environment variables

- **Settings** → **Environment Variables**
- Add (or confirm) for **Production**, **Preview**, and **Development**:

| Name | Value |
|------|--------|
| `REACT_APP_API_URL` | `https://admin-dashboard-production-2596.up.railway.app` |
| `REACT_APP_ADMIN_API_URL` | `https://admin-dashboard-production-2596.up.railway.app/api/admin` |

No trailing slash. Save each.

---

## 4. Vercel – Redeploy without cache

- **Deployments** → latest deployment → **⋯** → **Redeploy**
- Choose **Redeploy without cache** (or clear cache option)
- Wait for the build to succeed

---

## 5. Railway – CORS

- **Railway** → **backend** service → **Variables**
- Add or set: **CORS_ORIGINS** = `https://admin-dashboard-frontend-flax.vercel.app`  
  (your real Vercel URL, no trailing slash)
- Redeploy backend if needed

---

## 6. Test

- Open the app in **incognito**: `https://admin-dashboard-frontend-flax.vercel.app`
- Open DevTools → **Network**
- Click **Sign in**
- Confirm the request goes to `https://admin-dashboard-production-2596.up.railway.app/api/admin/login` (not localhost)
- If 401, run seed: `curl -X POST https://admin-dashboard-production-2596.up.railway.app/api/dev/seed-admin` then login with `admin@test.com` / `password123`
