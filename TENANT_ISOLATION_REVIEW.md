# Multi-Tenant Guard Isolation Review (#49)

## Executive Summary

**Status: PARTIALLY IMPLEMENTED** ⚠️

Multi-tenant isolation exists for **admin-side operations** but has **gaps in guard-side operations**. Guards can potentially access data from other tenants in certain scenarios.

---

## ✅ What IS Implemented

### 1. **Admin-Side Tenant Isolation** (FULLY IMPLEMENTED)
- ✅ `tenantFilter.js` utility in admin-dashboard backend
- ✅ All admin controllers use `getTenantSqlFilter()`, `canAccessTenant()`, `ensureTenantId()`
- ✅ Admin JWT tokens include `tenant_id`
- ✅ Super Admin can access all tenants; regular admins restricted to their tenant
- ✅ Examples:
  - `adminShifts.controller.js` - filters shifts by tenant
  - `adminGuards.controller.js` - checks tenant access before operations
  - `adminDashboard.controllers.js` - tenant-filtered data

### 2. **Guard Authentication** (PARTIALLY IMPLEMENTED)
- ✅ Guard JWT tokens include `tenant_id` (from `guardAuth.js` line 26)
- ✅ Guard tokens created with tenant_id (from `CREATE_GUARD_TOKEN.js` line 45)
- ✅ `req.user.tenant_id` is available in guard middleware

### 3. **Database Schema** (FULLY IMPLEMENTED)
- ✅ All tables have `tenant_id` column:
  - `guards` table has `tenant_id`
  - `shifts` table has `tenant_id`
  - `callouts` table has `tenant_id`
  - `time_entries` table has `tenant_id`
  - `pay_stubs` table has `tenant_id`
  - All other relevant tables have `tenant_id`

### 4. **Some Guard Controllers** (PARTIALLY IMPLEMENTED)
- ✅ `guardEarnings.controller.js` - Uses tenant_id for pay_stubs query (line 39)
- ✅ `announcements.controller.js` - Filters announcements by tenant_id (line 73)

---

## ❌ What is MISSING (Security Gaps)

### 1. **Guard Shift Access** (CRITICAL GAP)
**File**: `abe-guard-ai/backend/src/routes/shifts.routes.js`

**Issue**: Guards can list and accept shifts from ANY tenant

```javascript
// Line 53-56: No tenant filtering
router.get("/", async (req, res) => {
  const result = await pool.query("SELECT * FROM shifts ORDER BY shift_date, shift_start");
  res.json(result.rows); // ⚠️ Returns ALL shifts, no tenant filter
});

// Line 83: No tenant check when accepting shift
const shiftRes = await pool.query("SELECT * FROM shifts WHERE id=$1", [shiftId]);
// ⚠️ Guard from Tenant A could accept shift from Tenant B
```

**Risk**: 
- Guard from Tenant A can see and accept shifts from Tenant B
- Cross-tenant data leakage
- Potential security/compliance violation

### 2. **Guard Dashboard** (MEDIUM GAP)
**File**: `abe-guard-ai/backend/src/controllers/guardDashboard.controller.js`

**Issue**: Queries only filter by `guard_id`, not `tenant_id`

```javascript
// Lines 24-29: Only filters by guard_id
pool.query(
  `SELECT id, shift_date, shift_start, shift_end, status, location, created_at
   FROM public.shifts
   WHERE guard_id = $1  // ⚠️ Missing: AND tenant_id = $2
   ORDER BY shift_date DESC, shift_start DESC`,
  [guardId]
)
```

**Risk**: 
- If a guard's `guard_id` is somehow associated with shifts from multiple tenants (data corruption scenario)
- Guard could see shifts from wrong tenant

### 3. **Guard Alerts** (MEDIUM GAP)
**File**: `abe-guard-ai/backend/src/controllers/guardAlerts.controller.js`

**Issue**: Verifies `guard_id` but doesn't verify `tenant_id`

```javascript
// Line 42-44: Only checks guard_id
if (shift.guard_id && String(shift.guard_id) !== String(guardId)) {
  return res.status(403).json({ error: "Access denied" });
}
// ⚠️ Missing: Check if shift.tenant_id matches guard's tenant_id
```

**Risk**: 
- Guard could access alerts for shifts from other tenants if guard_id matches (edge case)

### 4. **Guard Notifications** (LOW GAP)
**File**: `abe-guard-ai/backend/src/controllers/guardNotifications.controller.js`

**Issue**: Only filters by `guard_id`, not `tenant_id`

**Risk**: 
- Low risk since notifications are guard-specific, but should still verify tenant

### 5. **Time Entries** (LOW GAP)
**File**: `abe-guard-ai/backend/src/controllers/timeEntries.controller.js`

**Issue**: Likely only filters by `guard_id` (needs verification)

**Risk**: 
- Guard could potentially clock in/out for shifts from wrong tenant

---

## 🔒 Recommended Fixes

### Priority 1: Critical (Fix Immediately)

#### 1. Add Tenant Filtering to Shift Listing
```javascript
// In shifts.routes.js, line 53
router.get("/", auth, async (req, res) => {
  try {
    const guardId = req.user?.guardId || req.user?.id;
    const tenantId = req.user?.tenant_id;
    
    let query = "SELECT * FROM shifts WHERE 1=1";
    const params = [];
    
    if (tenantId) {
      params.push(tenantId);
      query += ` AND tenant_id = $${params.length}`;
    }
    
    // Only show OPEN shifts or shifts assigned to this guard
    params.push(guardId);
    query += ` AND (status = 'OPEN' OR guard_id = $${params.length})`;
    query += " ORDER BY shift_date, shift_start";
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Get shifts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
```

#### 2. Add Tenant Verification to Shift Acceptance
```javascript
// In shifts.routes.js, line 83
const shiftRes = await pool.query(
  "SELECT * FROM shifts WHERE id=$1", 
  [shiftId]
);
const shift = shiftRes.rows[0];

// ✅ ADD THIS CHECK:
const guardTenantId = req.user?.tenant_id;
if (guardTenantId && shift.tenant_id && shift.tenant_id !== guardTenantId) {
  return res.status(403).json({ 
    error: "Access denied - shift belongs to different tenant" 
  });
}
```

### Priority 2: High (Fix Soon)

#### 3. Add Tenant Filtering to Guard Dashboard
```javascript
// In guardDashboard.controller.js
const guardId = req.user?.guardId || req.user?.id;
const tenantId = req.user?.tenant_id;

// Update all queries to include tenant_id:
pool.query(
  `SELECT id, shift_date, shift_start, shift_end, status, location, created_at
   FROM public.shifts
   WHERE guard_id = $1 ${tenantId ? 'AND tenant_id = $2' : ''}
   ORDER BY shift_date DESC, shift_start DESC`,
  tenantId ? [guardId, tenantId] : [guardId]
)
```

#### 4. Add Tenant Verification to Guard Alerts
```javascript
// In guardAlerts.controller.js, after line 42
const guardTenantId = req.user?.tenant_id;
if (guardTenantId && shift.tenant_id && shift.tenant_id !== guardTenantId) {
  return res.status(403).json({ 
    error: "Access denied - shift belongs to different tenant" 
  });
}
```

### Priority 3: Medium (Fix When Possible)

#### 5. Create Guard Tenant Filter Utility
```javascript
// Create: abe-guard-ai/backend/src/utils/guardTenantFilter.js
function getGuardTenantFilter(guard, params = []) {
  const tenantId = guard?.tenant_id;
  if (!tenantId) {
    return ""; // No filter if guard has no tenant
  }
  params.push(tenantId);
  return `tenant_id = $${params.length}`;
}

function canGuardAccessTenant(guard, tenantId) {
  if (!guard?.tenant_id) {
    return false; // Guard without tenant cannot access any tenant
  }
  return guard.tenant_id === tenantId;
}

module.exports = {
  getGuardTenantFilter,
  canGuardAccessTenant,
};
```

---

## 📊 Implementation Status Summary

| Component | Status | Tenant Filtering | Risk Level |
|-----------|--------|------------------|------------|
| Admin Operations | ✅ Complete | Yes | Low |
| Guard Authentication | ✅ Complete | Token includes tenant_id | Low |
| Guard Shift Listing | ❌ Missing | No | **CRITICAL** |
| Guard Shift Acceptance | ❌ Missing | No | **CRITICAL** |
| Guard Dashboard | ⚠️ Partial | No | Medium |
| Guard Alerts | ⚠️ Partial | No | Medium |
| Guard Earnings | ✅ Complete | Yes (pay_stubs) | Low |
| Guard Notifications | ⚠️ Partial | No | Low |
| Announcements | ✅ Complete | Yes | Low |

---

## 🎯 Conclusion

**#49 Multi-Tenant Guard Isolation is PARTIALLY IMPLEMENTED:**

- ✅ **Admin-side**: Fully isolated
- ✅ **Database schema**: Fully supports multi-tenancy
- ✅ **Guard authentication**: Includes tenant_id
- ❌ **Guard-side operations**: Missing tenant filtering in critical areas

**Recommendation**: 
1. **IMMEDIATELY** fix shift listing and acceptance (Critical security gap)
2. **SOON** add tenant filtering to dashboard and alerts
3. **EVENTUALLY** add tenant verification to all guard endpoints

**Estimated Effort**: 
- Critical fixes: 2-4 hours
- All fixes: 1-2 days

---

## 🔍 Testing Checklist

After implementing fixes, test:

1. ✅ Guard from Tenant A cannot see shifts from Tenant B
2. ✅ Guard from Tenant A cannot accept shifts from Tenant B
3. ✅ Guard dashboard only shows data from guard's tenant
4. ✅ Guard alerts only work for shifts from guard's tenant
5. ✅ Guard with no tenant_id cannot access any tenant data
6. ✅ Super admin (if guards can be super admin) can access all tenants

---

**Last Updated**: Based on codebase review of both backends
**Reviewed By**: AI Code Review
**Status**: Requires immediate attention for critical gaps
