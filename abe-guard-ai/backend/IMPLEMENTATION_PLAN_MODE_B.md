# Implementation Plan: Mode B (Calculated Payroll) Detailed Analysis

## ✅ Current Status

### Already Complete
- ✅ `requireAiPayrollEnabled.js` middleware
- ✅ `aiPayroll.routes.js` scaffold with mode detection
- ✅ Frontend `Payroll.jsx` wired up
- ✅ Base `TimeEntry` and `ShiftTimeEntry` models exist
- ✅ Mode A (PAYSTUB_UPLOAD) fully functional

### Needs Implementation
- ❌ Database schema for calculated payroll
- ❌ Payroll calculation engine/service
- ❌ AI endpoint Mode B data fetching
- ❌ Admin approval flow for adjustments

---

## 📋 Step-by-Step Implementation

### Phase 1: Database Schema

#### 1.1 Create `pay_periods` table
**Purpose**: Define payroll periods (weekly, bi-weekly, monthly)

**Fields**:
- `id` (UUID, PK)
- `tenant_id` (UUID, FK → tenants)
- `period_start` (DATE, required)
- `period_end` (DATE, required)
- `period_type` (ENUM: 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'SEMIMONTHLY')
- `status` (ENUM: 'OPEN', 'LOCKED', 'CLOSED', 'PAID')
- `locked_at` (TIMESTAMP, nullable)
- `locked_by_admin_id` (UUID, nullable, FK → admins)
- `created_at` (TIMESTAMP)

**Migration**: `20260117_000004_create_pay_periods.js`

#### 1.2 Create `timesheets` table
**Purpose**: Aggregated time tracking per guard per pay period

**Fields**:
- `id` (UUID, PK)
- `tenant_id` (UUID, FK → tenants)
- `guard_id` (UUID, FK → guards)
- `pay_period_id` (UUID, FK → pay_periods)
- `regular_hours` (DECIMAL(10,2), default 0)
- `overtime_hours` (DECIMAL(10,2), default 0)
- `double_time_hours` (DECIMAL(10,2), default 0)
- `total_hours` (DECIMAL(10,2), computed)
- `status` (ENUM: 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PROCESSED')
- `submitted_at` (TIMESTAMP, nullable)
- `approved_at` (TIMESTAMP, nullable)
- `approved_by_admin_id` (UUID, nullable, FK → admins)
- `calculated_at` (TIMESTAMP, nullable)
- `exceptions_count` (INTEGER, default 0) - flags for missed punches, geo issues
- `exceptions_json` (JSONB, nullable) - detailed exception data
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Unique constraint**: `(tenant_id, guard_id, pay_period_id)`

**Migration**: `20260117_000005_create_timesheets.js`

#### 1.3 Create `timesheet_lines` table
**Purpose**: Line-item breakdown of hours (by shift, by day)

**Fields**:
- `id` (UUID, PK)
- `timesheet_id` (UUID, FK → timesheets, CASCADE DELETE)
- `shift_id` (UUID, FK → shifts, nullable)
- `date` (DATE, required)
- `clock_in_at` (TIMESTAMP, nullable)
- `clock_out_at` (TIMESTAMP, nullable)
- `regular_hours` (DECIMAL(10,2), default 0)
- `overtime_hours` (DECIMAL(10,2), default 0)
- `double_time_hours` (DECIMAL(10,2), default 0)
- `premium_hours` (DECIMAL(10,2), default 0) - night shift, holiday premiums
- `premium_type` (TEXT, nullable) - 'NIGHT', 'HOLIDAY', 'WEEKEND', etc.
- `has_exception` (BOOLEAN, default false)
- `exception_type` (TEXT, nullable) - 'MISSED_PUNCH', 'GEO_MISMATCH', 'NO_CLOCK_OUT', etc.
- `created_at` (TIMESTAMP)

**Migration**: `20260117_000006_create_timesheet_lines.js`

#### 1.4 Create `payroll_adjustments` table
**Purpose**: Manual adjustments (bonuses, deductions, corrections)

**Fields**:
- `id` (UUID, PK)
- `tenant_id` (UUID, FK → tenants)
- `guard_id` (UUID, FK → guards)
- `pay_period_id` (UUID, FK → pay_periods)
- `timesheet_id` (UUID, FK → timesheets, nullable)
- `adjustment_type` (ENUM: 'BONUS', 'DEDUCTION', 'CORRECTION', 'AI_SUGGESTED')
- `amount` (DECIMAL(10,2), required) - positive = bonus, negative = deduction
- `description` (TEXT, required)
- `status` (ENUM: 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED')
- `suggested_by_ai` (BOOLEAN, default false) - flag for AI-generated suggestions
- `ai_suggestion_reason` (TEXT, nullable) - explanation from AI
- `requested_by_admin_id` (UUID, FK → admins)
- `approved_by_admin_id` (UUID, nullable, FK → admins)
- `approved_at` (TIMESTAMP, nullable)
- `applied_at` (TIMESTAMP, nullable)
- `created_at` (TIMESTAMP)

**Migration**: `20260117_000007_create_payroll_adjustments.js`

---

### Phase 2: Payroll Calculation Service

#### 2.1 Create `payrollCalculator.service.js`
**Purpose**: Calculate regular/OT/double-time from time entries

**Key functions**:
```javascript
// Calculate hours for a single shift/day
async calculateShiftHours(guardId, date, timeEntries)

// Aggregate hours for a pay period
async calculateTimesheet(guardId, payPeriodId)

// Detect exceptions (missed punches, geo mismatches)
async detectExceptions(timesheet)

// Calculate OT based on weekly/daily thresholds
function calculateOvertime(hoursWorked, thresholds)
```

**Location**: `/src/services/payrollCalculator.service.js`

#### 2.2 Create `timesheet.service.js`
**Purpose**: CRUD operations for timesheets and lines

**Key functions**:
```javascript
// Create/update timesheet from time entries
async generateTimesheet(guardId, payPeriodId)

// Get current timesheet for guard
async getCurrentTimesheet(guardId, tenantId)

// Get timesheet with exceptions breakdown
async getTimesheetWithExceptions(timesheetId)
```

**Location**: `/src/services/timesheet.service.js`

---

### Phase 3: Update AI Endpoint for Mode B

#### 3.1 Update `aiPayroll.routes.js` (line 117-121)

**Replace this**:
```javascript
// In B or HYBRID: include calculated payroll context (placeholder until built)
if (mode === "CALCULATED" || mode === "HYBRID") {
  ctx.calculatedPayroll = { enabled: true, note: "Calculated payroll scaffold - not implemented yet" };
}
```

**With this**:
```javascript
// In B or HYBRID: include calculated payroll context
if (mode === "CALCULATED" || mode === "HYBRID") {
  const { timesheetService, payrollCalculator } = require("../services");
  
  if (actor.type === "guard") {
    const guardId = req.user?.id || req.user?.guardId;
    
    // Get current pay period and timesheet
    const currentPayPeriod = await getCurrentPayPeriod(req.tenant.id);
    if (currentPayPeriod) {
      const timesheet = await timesheetService.getCurrentTimesheet(guardId, req.tenant.id);
      
      ctx.calculatedPayroll = {
        payPeriod: {
          id: currentPayPeriod.id,
          start: currentPayPeriod.period_start,
          end: currentPayPeriod.period_end,
          status: currentPayPeriod.status,
        },
        timesheet: timesheet ? {
          id: timesheet.id,
          regularHours: timesheet.regular_hours,
          overtimeHours: timesheet.overtime_hours,
          doubleTimeHours: timesheet.double_time_hours,
          totalHours: timesheet.total_hours,
          status: timesheet.status,
          exceptionsCount: timesheet.exceptions_count,
          exceptions: timesheet.exceptions_json || [],
        } : null,
        otBreakdown: timesheet ? await payrollCalculator.getOTBreakdown(timesheet.id) : null,
        approvalsStatus: timesheet ? {
          isApproved: timesheet.status === 'APPROVED',
          approvedBy: timesheet.approved_by_admin_id,
          approvedAt: timesheet.approved_at,
        } : null,
      };
    }
  } else {
    // Admin can query specific guard
    const guardId = req.body.guard_id;
    if (guardId) {
      // Similar logic as above
    }
  }
}
```

---

### Phase 4: Admin Approval Flow

#### 4.1 Create `adjustments.routes.js`
**Purpose**: Admin endpoints for approving/rejecting adjustments

**Endpoints**:
```javascript
// List pending adjustments
GET /api/admin/adjustments/pending

// Approve adjustment
POST /api/admin/adjustments/:id/approve

// Reject adjustment
POST /api/admin/adjustments/:id/reject

// Create manual adjustment
POST /api/admin/adjustments
```

**Location**: `/src/routes/adjustments.routes.js`

#### 4.2 AI Suggestion Safety
**Rule**: AI can suggest adjustments, but they **must** be:
- Marked as `status: 'DRAFT'` and `suggested_by_ai: true`
- Require admin approval before applying
- Include `ai_suggestion_reason` field with explanation

**AI Response Structure**:
```javascript
{
  answer: "I noticed a discrepancy...",
  suggestedAdjustment: {
    type: "CORRECTION",
    amount: -50.00,
    description: "Correcting missed clock-out on Jan 15",
    reason: "Timesheet shows 12 hours on Jan 15, but time entries indicate 8 hours. Suggesting correction.",
  },
  requiresAdminApproval: true,
}
```

---

### Phase 5: Optional Enhancements

#### 5.1 Socket.IO Notification
**Event**: `paystub:new`
**Trigger**: When a pay stub is created (Mode A) or timesheet is processed (Mode B)
**Payload**:
```javascript
{
  guard_id: "...",
  pay_period_id: "...",
  pay_date: "2026-01-17",
  type: "UPLOADED" | "CALCULATED",
}
```

**Location**: In `paystubs.routes.js` (POST) and `timesheets.routes.js` (when status changes to PROCESSED)

#### 5.2 Frontend Enhancement
**New component**: `PayrollAdjustments.jsx` (admin-only)
- List pending AI-suggested adjustments
- Approve/reject buttons
- Show AI reasoning

---

## 🔒 Safety Guards

### Important Rules

1. **AI Adjustments Always Require Approval**
   - Never auto-apply adjustments suggested by AI
   - Always set `status: 'DRAFT'` or `'PENDING_APPROVAL'`
   - Include `suggested_by_ai: true` flag

2. **Calculated Payroll Data Integrity**
   - Timesheets should be locked (`status: 'LOCKED'`) before processing
   - Calculations should be auditable (store calculation metadata)
   - Exceptions should be clearly flagged

3. **Mode Separation**
   - Mode A: Only pay stubs (no calculated data)
   - Mode B: Only calculated payroll (pay stubs optional/hidden)
   - Hybrid: Show both, compare, flag discrepancies

4. **Admin Permissions**
   - Regular admins can only approve adjustments for their tenant
   - Super admins can approve for any tenant

---

## 📝 Migration Checklist

- [ ] Create `pay_periods` table migration
- [ ] Create `timesheets` table migration
- [ ] Create `timesheet_lines` table migration
- [ ] Create `payroll_adjustments` table migration
- [ ] Register new models in `models/index.js`
- [ ] Define model associations (hasMany/belongsTo)

---

## 🧪 Testing Checklist

- [ ] Test timesheet calculation from time entries
- [ ] Test OT calculation logic
- [ ] Test exception detection (missed punches, geo issues)
- [ ] Test AI endpoint with Mode B data
- [ ] Test AI adjustment suggestion flow
- [ ] Test admin approval workflow
- [ ] Test Hybrid mode (both pay stubs + calculated)

---

## 📚 Related Files to Update

1. **Models**:
   - `models/PayPeriod.js` (new)
   - `models/Timesheet.js` (new)
   - `models/TimesheetLine.js` (new)
   - `models/PayrollAdjustment.js` (new)
   - `models/index.js` (register new models + associations)

2. **Services**:
   - `services/payrollCalculator.service.js` (new)
   - `services/timesheet.service.js` (new)

3. **Routes**:
   - `routes/aiPayroll.routes.js` (update Mode B data fetching)
   - `routes/adjustments.routes.js` (new)
   - `routes/paystubs.routes.js` (add Socket.IO emit if implementing)

4. **Frontend** (optional):
   - `guard-ui/src/pages/Payroll.jsx` (already wired, may need enhancements)
   - `admin-dashboard/src/pages/PayrollAdjustments.jsx` (new, for approval UI)

---

## 🎯 Priority Order

1. **High Priority** (Core Mode B functionality):
   - Phase 1: Database schema
   - Phase 2: Payroll calculation service
   - Phase 3: Update AI endpoint

2. **Medium Priority** (Admin workflows):
   - Phase 4: Admin approval flow

3. **Low Priority** (Nice-to-have):
   - Phase 5: Socket.IO notifications
   - Frontend approval UI

---

## 💡 Implementation Notes

- **OT Calculation**: Use weekly threshold (e.g., 40 hours) and daily threshold (e.g., 8 hours)
- **Exception Detection**: Flag missed punches, geo mismatches, suspicious patterns
- **Hybrid Mode Comparison**: When both pay stub and calculated data exist, compare hours and flag discrepancies
- **AI Context**: Structure `contextUsed` object clearly so AI agent can parse it effectively

---

**Status**: Ready for implementation ✅
