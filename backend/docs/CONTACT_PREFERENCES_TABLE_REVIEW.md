# ContactPreferences table – review: is dropping correct?

## Conclusion: **Yes. Dropping the table is the correct action.**

## Why

1. **No production usage**  
   No routes, controllers, or services read or write `ContactPreference` / `ContactPreferences`. The only references are:
   - Model definition and associations in `src/models/ContactPreference.js` and `src/models/index.js`
   - Test-only data in `src/test/adminDashboard.test.js` (which uses `testGuard.id` – a UUID – so the new UUID schema is correct)

2. **No migration owns this table**  
   The table is not created by any migration. It is created only by `sequelize.sync()` at server startup. There is no migration to update or that depends on this table.

3. **Schema was invalid**  
   The table had `guardId` as **INTEGER** while `guards.id` is **UUID**, so PostgreSQL could not create the foreign key. The model was updated so `guardId` is **UUID** and the FK can be created. If the table already exists with the old INTEGER column, `sync()` will **not** alter column types, so the only way to get the correct schema is to drop and let sync recreate it.

4. **No meaningful data at risk**  
   Because nothing in production uses this table, there is no production data to preserve. The test file uses UUIDs (`testGuard.id`) and will work with the new schema after sync recreates the table.

## What to do

- **Option A (recommended):** Run the one-off script once (e.g. on Railway or locally), then deploy so `sync()` recreates the table with the correct schema:
  ```bash
  cd backend && node scripts/drop-contact-preferences-table.js
  ```
- **Option B:** In your PostgreSQL client (e.g. Railway Postgres), run:
  ```sql
  DROP TABLE IF EXISTS "ContactPreferences";
  ```
  Then redeploy so the server runs and `sync()` creates the table again.

After the table is recreated, the foreign key `ContactPreferences_guardId_fkey` will be created successfully because `guardId` will be UUID to match `guards.id`.
