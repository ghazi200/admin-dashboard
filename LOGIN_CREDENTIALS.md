# Login credentials (test accounts)

These accounts **only work after you seed the database**. If login fails, run the seed first.

---

## 1. Seed the admin + supervisor (run once)

Call your **backend** (no auth required):

```bash
curl -X POST https://admin-dashboard-production-2596.up.railway.app/api/dev/seed-admin
```

Or in browser/Postman: **POST** `https://admin-dashboard-production-2596.up.railway.app/api/dev/seed-admin`

You should get JSON like `{ "ok": true, "note": "Seed complete ..." }`.

---

## 2. Then use these to sign in

| Role        | Email               | Password    |
|------------|---------------------|-------------|
| Admin      | `admin@test.com`    | `password123` |
| Supervisor | `supervisor@test.com` | `password123` |

---

## Copy-paste

**Email:** `admin@test.com`  
**Password:** `password123`

---

## Other options

- **Register a new account:** Use the Register flow in the app (if enabled) or `POST /api/admin/register` with `name`, `email`, `password`, `role`.
- **Super-admin:** Create via backend script: `node backend/src/scripts/createSuperAdmin.js your@email.com yourpassword "Your Name"` (then login with that email/password).
