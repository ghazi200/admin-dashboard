# Geographic Dashboard Setup

## Overview

The Geographic Dashboard shows an interactive map of sites (Google Maps). **The Map page and geographic APIs (sites, route optimization, analytics) are served only by the admin-dashboard backend.** If you see 404 errors, ensure you are running the backend from **admin-dashboard/backend** on port 5000 (e.g. `cd admin-dashboard/backend && node server.js`), not the abe-guard-ai or any other backend. Sites are tenant-filtered: super_admins see all sites; tenant admins see their tenant’s sites plus global sites (`tenant_id` IS NULL). A **live total sites count** appears in the sidebar and on the main Dashboard. **Route optimization** suggests a visit order for selected sites (nearest-neighbor) and draws the route on the map. **Geographic analytics** shows total sites, with/without coordinates, and average/max distance between sites.

---

## Database verification

The admin dashboard backend uses the **abe_guard** database:

- **Config:** `backend/.env` — `DATABASE_URL` or `DB_NAME` should point to `abe_guard` (or `abe-guard`).
- **Verify:** From `backend` run:
  - `node src/scripts/verifyDatabaseConnection.js` — if present.
  - Or check that the server starts and connects without DB errors.

---

## Create the sites table

From the **backend** folder (PostgreSQL running, `abe_guard` available):

```bash
cd backend
node src/scripts/createSitesTable.js
```

The script loads `backend/.env` (or repo root `.env`), verifies the database is **abe_guard**, creates the `sites` table if missing, and inserts a test site if the table is empty.

**Table columns:** `id`, `name`, `address_1`, `address_2`, `latitude`, `longitude`, `tenant_id`, `created_at`, `updated_at`.  
(The API exposes a single `address` built from `address_1` + `address_2`.)

---

## Add sites (recommended: use script)

**Option A – Insert a global test site (visible to all admins):**

```bash
cd backend
node src/scripts/insertTestSite.js
```

This script:

- Ensures `sites` has `latitude`/`longitude` columns (adds them if missing).
- Allows `tenant_id` to be NULL for global sites.
- Geocodes **248 Duffield Street, Brooklyn, NY 11212** (or updates any existing “Map Test Site” to this address).
- Inserts a global site so all admins see at least one site on the map.

**Option B – Optional tenant-specific site:**

```bash
TENANT_ID=your-tenant-uuid node src/scripts/insertTestSite.js
```

**Option C – Manual SQL** (if you prefer):

```sql
INSERT INTO sites (id, name, address_1, address_2, latitude, longitude, tenant_id, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'My Site',
  '248 Duffield Street',
  'Brooklyn, NY 11212',
  40.69112,
  -73.98451,
  NULL,  -- NULL = global (all admins); or use a tenant UUID
  NOW(),
  NOW()
);
```

Sites need non-null `latitude` and `longitude` to appear as markers on the map.

---

## Frontend: Google Maps API key

1. In the frontend folder, ensure `.env` exists (e.g. copy from `.env.example`):
   ```bash
   cd frontend-admin-dashboard/admin-dashboard-frontend
   cp .env.example .env   # if needed
   ```
2. Set your Google Maps JavaScript API key in `.env`:
   ```
   REACT_APP_GOOGLE_MAPS_API_KEY=your_actual_key_here
   ```
3. In [Google Cloud Console](https://console.cloud.google.com/), enable **Maps JavaScript API** for the project.
4. Restart the frontend dev server after changing `.env`.

---

## Using the Map page

1. Log in to the admin dashboard.
2. Open **Map** in the sidebar (or go to `/map`).
3. The map loads and shows all sites that have coordinates. Click a marker to see the site name and address in an info window.
4. Use **+ Add site** to create sites with name, address, and optional lat/lng.

If no sites have coordinates, the map shows the default view (e.g. New York). Run `node src/scripts/insertTestSite.js` from `backend` to add a test site, then refresh the Map page.

---

## Live sites count

- **Sidebar:** Under the Map link, **Sites: N** shows the total number of sites for the current tenant (refreshes every 20 seconds).
- **Dashboard:** The main Dashboard KPI row includes a **Sites** count that uses the same data and also updates every 20 seconds.

## Route optimization

On the Map page, when you have at least two sites with coordinates:

1. Check the sites you want to visit.
2. Click **Optimize route**. The backend returns a visit order that minimizes total travel distance (nearest-neighbor algorithm).
3. The route is drawn as a green polyline on the map; the visit order and total distance (km) are shown below. Use **Clear route** to remove it.

API: `POST /api/admin/geographic/route-optimize` with body `{ siteIds: string[], origin?: { lat, lng } }`.

## Geographic analytics

The Map page shows a small analytics panel (refreshes every 30 seconds):

- **Total sites** — count for the current tenant (including global).
- **With coordinates** — count of sites that have lat/lng and appear on the map.
- **Avg distance (km)** — average distance between all pairs of sites (when there are at least 2 with coordinates).
- **Max distance (km)** — maximum distance between any two sites.

API: `GET /api/admin/geographic/analytics`.
