# Vercel Root Directory for this project

**Vercel Project ID:** `prj_5BRUrI1V5xMjclgL8qIwVvAocDR4`

Your repo structure:

```
admin-dashboard/                          ← Git repo root
└── frontend-admin-dashboard/
    └── admin-dashboard-frontend/        ← APP ROOT (has package.json, src/, socket.js)
        ├── package.json
        ├── vercel.json
        └── src/
            └── realtime/
                └── socket.js
```

**Set in Vercel:**

1. Go to: **Vercel Dashboard** → Project (ID above) → **Settings** → **General**.
2. Find **Root Directory**.
3. Set it to exactly:
   ```text
   frontend-admin-dashboard/admin-dashboard-frontend
   ```
4. Click **Save**.
5. Go to **Deployments** → **Redeploy** the latest → enable **Clear cache and redeploy**.

If Root Directory was wrong (e.g. empty or `frontend-admin-dashboard`), the build could have been failing or building the wrong folder, so you saw an old/cached build. After setting it to `frontend-admin-dashboard/admin-dashboard-frontend`, the next deploy will build the app that contains the updated `socket.js`.
