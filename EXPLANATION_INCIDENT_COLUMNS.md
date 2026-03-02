# Why Incident Columns Don't Exist - Explanation

## The Problem

The code was trying to query columns that **don't exist** in the `incidents` table:
- `guard_id` ❌
- `shift_id` ❌
- `site_id` ❌
- `type` ❌
- `occurred_at` ❌
- `reported_at` ❌
- `location_text` ❌
- `ai_summary` ❌
- `ai_tags_json` ❌
- `attachments_json` ❌

## What Actually Exists

The actual `incidents` table schema (from database):
```sql
CREATE TABLE incidents (
  id          UUID PRIMARY KEY,
  tenant_id   UUID,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  status      VARCHAR(50) DEFAULT 'OPEN',
  severity    VARCHAR(50) DEFAULT 'MEDIUM',
  created_at  TIMESTAMP DEFAULT now(),
  updated_at  TIMESTAMP DEFAULT now()
);
```

**Only 8 columns exist:**
- `id`
- `tenant_id`
- `title`
- `description`
- `status`
- `severity`
- `created_at`
- `updated_at`

## Why This Mismatch Happened

### 1. **Simplified Schema Creation**
The `incidents` table was created with a **minimal schema** in `createSuperAdminTestData.js`:
```javascript
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'OPEN',
  severity VARCHAR(50) DEFAULT 'MEDIUM',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

This was a **basic/minimal** schema created for testing purposes.

### 2. **Code Written for Extended Schema**
However, the code in `siteHealth.service.js` and other services was written expecting a **more comprehensive schema** with:
- **Relationships**: `guard_id`, `shift_id` (to link incidents to guards/shifts)
- **Location tracking**: `site_id`, `location_text`
- **Timestamps**: `occurred_at`, `reported_at` (separate from `created_at`)
- **AI features**: `ai_summary`, `ai_tags_json`
- **Metadata**: `type`, `attachments_json`

### 3. **Schema Evolution Mismatch**
This is a common issue in software development:
- **Initial implementation**: Simple schema (just basic fields)
- **Code written later**: Assumes extended schema (with relationships and metadata)
- **No migration**: The database schema was never updated to match the code expectations

## Why Those Columns Would Be Useful

### `guard_id` and `shift_id`
- **Purpose**: Link incidents to specific guards or shifts
- **Use case**: "Incident occurred during Guard X's shift Y"
- **Current workaround**: Can't directly link incidents to guards/shifts

### `site_id`
- **Purpose**: Track which site/location the incident occurred at
- **Use case**: "Site health dashboard shows incidents per site"
- **Current workaround**: Using `tenant_id` instead (less granular)

### `occurred_at` vs `reported_at`
- **Purpose**: 
  - `occurred_at`: When the incident actually happened
  - `reported_at`: When it was reported to the system
- **Use case**: "Incident happened at 2 PM but wasn't reported until 3 PM"
- **Current workaround**: Using `created_at` for both (loses timing information)

### `type`
- **Purpose**: Categorize incidents (e.g., "theft", "vandalism", "medical", "security breach")
- **Use case**: Filter and analyze incidents by type
- **Current workaround**: No categorization available

### `location_text`
- **Purpose**: Human-readable location description
- **Use case**: "Building A, Floor 3, Room 301"
- **Current workaround**: Only have `title` and `description` (less structured)

### `ai_summary` and `ai_tags_json`
- **Purpose**: AI-generated summaries and tags for incidents
- **Use case**: Automatic incident analysis and categorization
- **Current workaround**: No AI features available

## The Fix

I've fixed the code to:
1. ✅ **Created Incident model** matching the actual database schema
2. ✅ **Updated queries** to use only existing columns:
   - `tenant_id` → `tenantId`
   - `created_at` → `createdAt` (instead of `reported_at`)
   - Removed references to non-existent columns

## Future Enhancement (Optional)

If you want to add those columns later, you would need a migration:

```sql
ALTER TABLE incidents
  ADD COLUMN guard_id UUID,
  ADD COLUMN shift_id UUID,
  ADD COLUMN site_id UUID,
  ADD COLUMN type VARCHAR(50),
  ADD COLUMN occurred_at TIMESTAMP,
  ADD COLUMN reported_at TIMESTAMP,
  ADD COLUMN location_text TEXT,
  ADD COLUMN ai_summary TEXT,
  ADD COLUMN ai_tags_json JSONB,
  ADD COLUMN attachments_json JSONB;
```

But for now, the code works with the **existing minimal schema**.

## Summary

**The columns don't exist because:**
1. The table was created with a minimal/basic schema
2. The code was written expecting a more comprehensive schema
3. No migration was done to add the missing columns

**The fix:**
- Updated code to match the actual database schema
- Removed references to non-existent columns
- Created proper Incident model

The system now works correctly with the existing schema! ✅
