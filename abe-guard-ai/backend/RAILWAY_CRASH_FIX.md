# Railway crash: "JWT_SECRET is required in production"

If the service exits on deploy with:

```text
JWT_SECRET is required in production and must be at least 16 characters
```

the app is running in production but **JWT_SECRET** is missing or too short.

## Fix

1. In **Railway** → open the **abe-guard-ai** (or this backend) service.
2. Go to **Variables** (or **Settings** → **Variables**).
3. Add a variable:
   - **Name:** `JWT_SECRET`
   - **Value:** a long random string, **at least 16 characters** (e.g. 32+). Example: `my-super-secret-jwt-key-at-least-16-chars`
4. **Redeploy** the service (or trigger a new deploy so the variable is picked up).

## Note

- **JWT_SECRET** must be the same value on both **admin dashboard backend** and **abe-guard-ai** if they issue/verify each other’s tokens.
- Do not commit the real secret to git; set it only in Railway (and local `.env` if needed).

## Other required variables

See **RAILWAY_VARIABLES.txt** in this folder for the full list (e.g. `NODE_ENV=production`, `DATABASE_URL`, `CORS_ORIGINS`).
