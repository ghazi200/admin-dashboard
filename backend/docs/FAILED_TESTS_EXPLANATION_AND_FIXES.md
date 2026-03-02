# Failed Tests: Explanation and Fixes

## 1. adminLogin.test.js

### What failed
- **Error 1:** Failure during `beforeAll` at `await db.sequelize.sync({ force: true })`.
- **Cause:** The test uses the full shared `db` from `require('../models')` with `NODE_ENV=test` (SQLite in-memory). `sync({ force: true })` syncs **every** model. When Sequelize tries to create the **ScheduledReport** table, it fails because:
  - **ScheduledReport** uses `DataTypes.ARRAY(DataTypes.STRING)` for `email_recipients`.
  - **ARRAY** is a PostgreSQL-only type; Sequelize does not support it for SQLite, so sync fails when running tests against SQLite.

- **Error 2 (if sync fixed):** Supertest can show `Cannot read properties of null (reading 'port')` or `listen EPERM` if the test environment blocks binding a port. The test app from `app.js` does not set `app.locals.models`, so the login controller would get `undefined` for `req.app.locals.models` without the fix below.

### Fix applied
- In the test `beforeAll`:
  - Use **`await db.Admin.sync({ force: true });`** instead of `db.sequelize.sync({ force: true })` so only the Admin table is created (avoids ScheduledReport and other SQLite-incompatible models).
  - Set **`app.locals.models = db`** so the login controller can access `req.app.locals.models.Admin`.
- Run tests with permissions that allow binding (e.g. `npm test` without a sandbox that blocks `listen`).

**Status:** Fixed. The test now passes (sync only Admin, set `app.locals.models = db`).

---

## 2. adminDashboard.test.js

### What fails
- **Error:** `SequelizeValidationError: notNull Violation: Shift.id cannot be null` at `Shift.create({ title: 'Night Shift', date: new Date(), status: 'open', ... })`.
- **Causes:**
  1. **Shift** model defines `id` as `DataTypes.UUID`, `primaryKey: true`, `allowNull: false` **with no `defaultValue`**. In SQLite, UUIDs are not auto-generated like in PostgreSQL, so if you don’t pass `id`, it stays null and validation fails.
  2. **Wrong attribute names:** The test passes `title` and `date`, but the **Shift** model has **`shift_date`** (not `date`) and **no `title`** (it has `location`). So the test is not matching the real model schema.

### Fixes applied
1. **Shift model:** Added `defaultValue: DataTypes.UUIDV4` to `id` in `Shift.js`.
2. **CallOut model:** Added `defaultValue: DataTypes.UUIDV4` to `id` in `CallOut.js`.
3. **adminDashboard.test.js:** Aligned with model schemas (shift_date, guard_id, location; CallOut with guard_id, reason, created_at) and set **`app.locals.models`** to the test’s sequelize and models.

### Remaining adminDashboard failures (why some tests still fail)
- **PostgreSQL-only SQL:** The dashboard controllers use raw SQL that is not valid on SQLite (e.g. `DISTINCT ON`, `::boolean`, `ANY($2::int[])`). When the test runs with in-memory SQLite, those queries throw and you get 500 or empty results.
- **Response shape:** Some endpoints may return `{ data: [] }` instead of a bare array; the test expects `res.body.length` and fails when `res.body` is an object.
- **Routes on test app:** The test uses `app.js`, which only mounts a subset of routes. If a route is not mounted there (e.g. only in `server.js`), the test will get 404.

**Ways to fix or relax adminDashboard tests:**
1. **Use a real Postgres test DB** for dashboard tests (e.g. `NODE_ENV=test` with `DATABASE_URL` pointing to a test PostgreSQL DB) so the controller SQL runs as written.
2. **Skip dashboard tests when dialect is SQLite** (e.g. `if (sequelize.getDialect() === 'sqlite') test.skip(...)`).
3. **Refactor controllers** to use Sequelize/query builder or dialect-agnostic SQL so the same code works on SQLite in tests and Postgres in production.
4. **Adjust expectations** to match actual response shape (e.g. `res.body.data` instead of `res.body`) and only assert on behavior that works with the test app’s routes.

---

## Summary

| Test                  | Root cause                                                                 | Fix                                                                 |
|-----------------------|----------------------------------------------------------------------------|---------------------------------------------------------------------|
| **adminLogin**        | Full `sync()` runs ScheduledReport; ARRAY type is not supported in SQLite | Sync only Admin and set `app.locals.models`, or use JSON for array |
| **adminDashboard**    | Shift/CallOut id and fields; app.locals.models; Postgres-only SQL in controllers | UUID defaults; correct fields; set app.locals.models; see below for remaining issues |
