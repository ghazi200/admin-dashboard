# Incident Extended Schema Migration - Complete ✅

## Summary

Successfully migrated the `incidents` table from a minimal schema (8 columns) to an extended schema (18 columns) with full support for all roles (super admin, admin, supervisor).

## Migration Results

### ✅ Columns Added (10 new columns)

1. **`guard_id`** (UUID) - Link incident to guard
2. **`shift_id`** (UUID) - Link incident to shift
3. **`site_id`** (UUID) - Link incident to site/location
4. **`type`** (VARCHAR(100)) - Incident type (theft, vandalism, medical, etc.)
5. **`occurred_at`** (TIMESTAMP) - When the incident actually occurred
6. **`reported_at`** (TIMESTAMP) - When the incident was reported
7. **`location_text`** (TEXT) - Human-readable location description
8. **`ai_summary`** (TEXT) - AI-generated summary of the incident
9. **`ai_tags_json`** (JSONB) - AI-generated tags in JSON format
10. **`attachments_json`** (JSONB) - Attachments metadata in JSON format

### ✅ Indexes Created (6 indexes)

1. `idx_incidents_guard_id` - For guard-based queries
2. `idx_incidents_shift_id` - For shift-based queries
3. `idx_incidents_site_id` - For site-based queries
4. `idx_incidents_tenant_id` - For tenant-based queries
5. `idx_incidents_reported_at` - For time-based queries
6. `idx_incidents_status` - For status filtering

## Complete Schema (18 columns)

```sql
CREATE TABLE incidents (
  id              UUID PRIMARY KEY,
  tenant_id       UUID,
  guard_id        UUID,        -- ✅ NEW
  shift_id        UUID,        -- ✅ NEW
  site_id         UUID,        -- ✅ NEW
  title           VARCHAR(255) NOT NULL,
  type            VARCHAR(100), -- ✅ NEW
  description     TEXT,
  status          VARCHAR(50) DEFAULT 'OPEN',
  severity        VARCHAR(50) DEFAULT 'MEDIUM',
  occurred_at     TIMESTAMP,   -- ✅ NEW
  reported_at     TIMESTAMP,   -- ✅ NEW
  location_text   TEXT,        -- ✅ NEW
  ai_summary      TEXT,        -- ✅ NEW
  ai_tags_json    JSONB,       -- ✅ NEW
  attachments_json JSONB,      -- ✅ NEW
  created_at      TIMESTAMP DEFAULT now(),
  updated_at      TIMESTAMP DEFAULT now()
);
```

## Code Updates

### ✅ 1. Incident Model (`backend/src/models/Incident.js`)
- Updated to include all 18 columns
- Added proper field mappings for underscored columns
- Added associations with Guard, Shift, and Tenant

### ✅ 2. Model Associations (`backend/src/models/index.js`)
- Added Incident associations:
  - `Incident.belongsTo(Tenant)`
  - `Incident.belongsTo(Guard)`
  - `Incident.belongsTo(Shift)`
  - `Guard.hasMany(Incident)`
  - `Shift.hasMany(Incident)`

### ✅ 3. Site Health Service (`backend/src/services/siteHealth.service.js`)
- Updated queries to use `siteId` instead of `tenantId` for site filtering
- Updated queries to use `reportedAt` instead of `createdAt` for time filtering
- Now properly filters incidents by site

### ✅ 4. Super Admin Controller (`backend/src/controllers/superAdmin.controller.js`)
- Updated query to include all extended schema columns
- Now returns: `guard_id`, `shift_id`, `site_id`, `type`, `occurred_at`, `reported_at`, `location_text`, `ai_summary`, `ai_tags_json`, `attachments_json`
- Orders by `reported_at` (with fallback to `created_at`)

### ✅ 5. Operational Data RAG Service (`backend/src/services/operationalDataRag.service.js`)
- Updated to use `reportedAt` field name (camelCase)
- Updated to use `aiSummary` field name (camelCase)
- Now properly accesses extended schema fields

## Benefits for All Roles

### Super Admin
- ✅ Can see incidents with full details across all tenants
- ✅ Can filter by site, guard, shift
- ✅ Can see AI analysis and tags
- ✅ Can track when incidents occurred vs when they were reported

### Admin
- ✅ Can link incidents to specific guards and shifts
- ✅ Can categorize incidents by type
- ✅ Can track location details
- ✅ Can use AI-generated summaries and tags

### Supervisor
- ✅ Can see incidents related to their guards/shifts
- ✅ Can filter by site/location
- ✅ Can see incident timeline (occurred_at vs reported_at)
- ✅ Can access attachments metadata

## Usage Examples

### Create Incident with Extended Fields
```javascript
await Incident.create({
  tenantId: tenantId,
  guardId: guardId,        // ✅ NEW
  shiftId: shiftId,        // ✅ NEW
  siteId: siteId,          // ✅ NEW
  title: "Security Breach",
  type: "security",        // ✅ NEW
  description: "Unauthorized access detected",
  status: "OPEN",
  severity: "HIGH",
  occurredAt: new Date("2024-01-15T14:30:00"),  // ✅ NEW
  reportedAt: new Date("2024-01-15T14:45:00"),  // ✅ NEW
  locationText: "Building A, Floor 3, Room 301", // ✅ NEW
  aiSummary: "AI detected potential security threat", // ✅ NEW
  aiTagsJson: { tags: ["security", "breach", "urgent"] }, // ✅ NEW
  attachmentsJson: { files: ["photo1.jpg", "video1.mp4"] } // ✅ NEW
});
```

### Query Incidents by Site
```javascript
const incidents = await Incident.findAll({
  where: {
    tenantId: tenantId,
    siteId: siteId,        // ✅ NEW - Now works!
    reportedAt: {
      [Op.gte]: startDate  // ✅ NEW - Now works!
    }
  },
  include: [
    { model: Guard, as: "guard" },  // ✅ NEW - Can join guard
    { model: Shift, as: "shift" }   // ✅ NEW - Can join shift
  ]
});
```

## Migration Script

The migration script is located at:
- `backend/src/scripts/migrateIncidentsToExtendedSchema.js`

To re-run the migration (safe - uses `IF NOT EXISTS`):
```bash
cd backend
node src/scripts/migrateIncidentsToExtendedSchema.js
```

## Next Steps

1. ✅ **Migration Complete** - All columns added
2. ✅ **Model Updated** - Incident model includes all fields
3. ✅ **Queries Updated** - All services use extended schema
4. ✅ **Indexes Created** - Performance optimized
5. ✅ **Associations Added** - Can join with Guard, Shift, Tenant

## Testing

To test the extended schema:

1. **Create an incident with extended fields:**
   ```sql
   INSERT INTO incidents (
     tenant_id, guard_id, shift_id, site_id, title, type,
     occurred_at, reported_at, location_text, ai_summary
   ) VALUES (
     'tenant-uuid', 'guard-uuid', 'shift-uuid', 'site-uuid',
     'Test Incident', 'test',
     '2024-01-15 14:30:00', '2024-01-15 14:45:00',
     'Test Location', 'AI Summary'
   );
   ```

2. **Query via API:**
   - Super Admin Dashboard: Should show all extended fields
   - Site Health: Should filter by site_id
   - Command Center: Should show location_text and ai_summary

## Status

✅ **COMPLETE** - Extended schema is now available for all roles!

All roles (super admin, admin, supervisor) now have access to the full extended incident schema with all 18 columns.
