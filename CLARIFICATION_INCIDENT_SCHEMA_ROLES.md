# Clarification: Incident Schema and Roles

## The Truth: **ALL Roles Use the Same Schema**

### ❌ **NOT True:**
- "Admins and supervisors have detailed schema, super admin doesn't"
- "Different roles see different columns"
- "Role-based schema differences"

### ✅ **Actually True:**
- **ALL roles** (admin, supervisor, super admin) use the **SAME** `incidents` table
- The table has a **minimal schema** (8 columns) for **everyone**
- The code was written expecting an **extended schema** that **doesn't exist for ANY role**

## The Actual Situation

### Database Table (Same for Everyone)
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

**This is the schema for:**
- ✅ Super Admin
- ✅ Admin
- ✅ Supervisor
- ✅ Guards (if they access incidents)

**Everyone sees the same 8 columns!**

## Why the Confusion?

### The Code Expected More Columns

The code in `siteHealth.service.js` and other services was written expecting:
```sql
-- Expected (but doesn't exist):
guard_id, shift_id, site_id, type, 
occurred_at, reported_at, location_text, 
ai_summary, ai_tags_json, attachments_json
```

### But the Database Only Has:
```sql
-- Actual (what exists):
id, tenant_id, title, description, 
status, severity, created_at, updated_at
```

## Where the Code Tried to Use Missing Columns

### 1. **siteHealth.service.js**
- Tried to query `site_id` → Doesn't exist
- Tried to query `reported_at` → Doesn't exist
- Tried to query `guard_id` → Doesn't exist

### 2. **superAdmin.controller.js**
- Queries incidents for super admin dashboard
- Uses same minimal schema as everyone else

### 3. **operationalDataRag.service.js**
- Tried to use `reported_at`, `ai_summary` → Don't exist

## The Fix

I've updated the code to:
1. ✅ Use only columns that **actually exist** in the database
2. ✅ Work with the **minimal schema** for **all roles**
3. ✅ Remove references to non-existent columns

## Summary

**Question:** "Do admins and supervisors have detailed schema but super admin doesn't?"

**Answer:** **NO!** 
- All roles use the **same minimal schema** (8 columns)
- The code was written expecting an extended schema that **doesn't exist for anyone**
- This was a **schema mismatch**, not a **role-based difference**

**The fix applies to ALL roles equally** - everyone now uses the correct minimal schema! ✅
