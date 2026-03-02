# Messaging and database

In-app messaging (admin and guard) uses the **same database** as the rest of the backend.

- **Required database name:** `abe_guard` (or `abe-guard`).
- **Config:** Set `DATABASE_URL` in `backend/.env` so the path ends with `/abe_guard`, for example:
  - `DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/abe_guard`
- The server **exits on startup** if it is not connected to `abe_guard`, so you will see an error immediately if the wrong database is used.
- Restart the backend after changing `.env` so the new `DATABASE_URL` is loaded.

**Guard app seeing messages:** The Guard UI calls the **admin-dashboard** backend for messages (`/api/guard/messages/*`). Ensure the **same `JWT_SECRET`** is set in both `admin-dashboard/backend/.env` and `abe-guard-ai/backend/.env` so the guard token (issued by Guard API) is accepted by the admin backend.
