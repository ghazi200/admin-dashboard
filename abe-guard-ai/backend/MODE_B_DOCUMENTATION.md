# Mode B (Calculated Payroll) Implementation Documentation

## Overview

Mode B (Calculated Payroll) enables automatic calculation of hours, overtime, and payroll from time entries. This system calculates regular hours, overtime (daily and weekly), double-time, and detects exceptions such as missed punches.

**Key Features:**
- Automatic timesheet generation from time entries
- Overtime calculation (daily 8h threshold, weekly 40h threshold)
- Double-time calculation (after 12h/day)
- Exception detection (missed punches, excessive hours)
- AI payroll assistant with calculated data context
- Admin approval workflow for adjustments

---

## Architecture

### Database Schema

#### 1. `pay_periods` Table
Defines payroll periods (weekly, bi-weekly, monthly, semi-monthly).

**Key Fields:**
- `id` (UUID, PK)
- `tenant_id` (UUID, FK → tenants)
- `period_start` (DATE)
- `period_end` (DATE)
- `period_type` (ENUM: WEEKLY, BIWEEKLY, MONTHLY, SEMIMONTHLY)
- `status` (ENUM: OPEN, LOCKED, CLOSED, PAID)

#### 2. `timesheets` Table
Aggregated timesheet data per guard per pay period.

**Key Fields:**
- `id` (UUID, PK)
- `tenant_id`, `guard_id`, `pay_period_id` (FKs)
- `regular_hours`, `overtime_hours`, `double_time_hours` (DECIMAL)
- `total_hours` (DECIMAL)
- `status` (ENUM: DRAFT, SUBMITTED, APPROVED, REJECTED, PROCESSED)
- `exceptions_count` (INTEGER)
- `exceptions_json` (JSONB) - Detailed exception data
- `approved_by_admin_id`, `approved_at` - Approval tracking

**Unique Constraint:** `(tenant_id, guard_id, pay_period_id)` - One timesheet per guard per period

#### 3. `timesheet_lines` Table
Day-by-day breakdown of hours.

**Key Fields:**
- `id` (UUID, PK)
- `timesheet_id` (UUID, FK → timesheets)
- `shift_id` (UUID, FK → shifts, nullable)
- `date` (DATEONLY)
- `clock_in_at`, `clock_out_at` (TIMESTAMP)
- `regular_hours`, `overtime_hours`, `double_time_hours` (DECIMAL)
- `premium_hours`, `premium_type` - Night shift, holiday premiums
- `has_exception`, `exception_type` - Exception flags

#### 4. `payroll_adjustments` Table
Manual or AI-suggested payroll adjustments.

**Key Fields:**
- `id` (UUID, PK)
- `tenant_id`, `guard_id`, `pay_period_id` (FKs)
- `timesheet_id` (UUID, FK → timesheets, nullable)
- `adjustment_type` (ENUM: BONUS, DEDUCTION, CORRECTION, AI_SUGGESTED)
- `amount` (DECIMAL) - Positive = bonus, negative = deduction
- `description` (TEXT)
- `status` (ENUM: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, APPLIED)
- `suggested_by_ai` (BOOLEAN)
- `ai_suggestion_reason` (TEXT)
- `requested_by_admin_id`, `approved_by_admin_id` - Approval tracking

---

## Services

### 1. `payrollCalculator.service.js`

Calculates hours and overtime from time entries.

**Key Functions:**

#### `calculateHoursWorked(clockIn, clockOut, lunchStart, lunchEnd)`
Calculates hours worked excluding lunch breaks.
- **Returns:** `number` (decimal hours)

#### `calculateOvertime(dailyHours, weeklyHours, thresholds)`
Calculates regular, overtime, and double-time based on thresholds.
- **Parameters:**
  - `dailyHours` - Hours worked on a specific day
  - `weeklyHours` - Total hours worked in the week so far
  - `thresholds` - `{ dailyOT: 8, weeklyOT: 40, doubleTimeThreshold: 12 }`
- **Returns:** `{ regular, overtime, doubleTime }`

#### `detectExceptions(timeEntries, shift)`
Detects exceptions in time entries.
- **Returns:** Array of exception objects:
  ```javascript
  {
    type: "MISSED_CLOCK_IN" | "MISSED_CLOCK_OUT" | "EXCESSIVE_HOURS" | "NO_TIME_ENTRIES",
    date: "YYYY-MM-DD",
    message: string,
    severity: "HIGH" | "MEDIUM",
    time_entry_id: UUID,
    hours?: number
  }
  ```

#### `calculateShiftHours(guardId, date, timeEntries, thresholds)`
Calculates hours for a single shift/day.
- **Returns:** `{ regular, overtime, doubleTime, total, exceptions }`

#### `calculateWeeklyOT(dailyBreakdowns, thresholds)`
Calculates weekly OT breakdown from daily breakdowns.
- **Returns:** `{ regular, overtime, doubleTime, total, byDay: [...] }`

### 2. `timesheet.service.js`

CRUD operations for timesheets.

**Key Functions:**

#### `getCurrentPayPeriod(tenantId, referenceDate)`
Finds the active pay period for a tenant.
- **Returns:** `PayPeriod` object or `null`

#### `getCurrentTimesheet(guardId, tenantId, referenceDate)`
Gets the current timesheet for a guard.
- **Returns:** `Timesheet` object or `null`

#### `generateTimesheet(guardId, payPeriodId, tenantId)`
Creates or updates a timesheet from time entries.
- **Process:**
  1. Finds or creates timesheet
  2. Fetches time entries for the pay period
  3. Groups entries by date
  4. Calculates hours for each day
  5. Creates timesheet lines
  6. Calculates weekly OT
  7. Updates timesheet totals and exceptions

- **Returns:** `Timesheet` with `lines` association

#### `getTimesheetWithExceptions(timesheetId)`
Gets timesheet with detailed exception breakdown.
- **Returns:** `Timesheet` with `lines` association

#### `getTimesheetLines(timesheetId)`
Gets all timesheet lines for a timesheet.
- **Returns:** Array of `TimesheetLine` objects

---

## API Endpoints

### AI Payroll Endpoint

#### `POST /api/ai/payroll/ask`

**Mode-Aware Payroll Questions**

This endpoint adapts its response based on `tenant.payroll_mode`:

- **PAYSTUB_UPLOAD (Mode A):** Returns pay stub data only
- **CALCULATED (Mode B):** Returns calculated timesheet data only
- **HYBRID:** Returns both pay stub and calculated data

**Request:**
```json
{
  "question": "What are my hours for this pay period?"
}
```

**Response (Mode B/HYBRID):**
```json
{
  "ok": true,
  "contextUsed": {
    "mode": "CALCULATED",
    "actor": { "type": "guard", "id": "...", "role": "guard" },
    "question": "...",
    "calculatedPayroll": {
      "payPeriod": {
        "id": "...",
        "start": "2026-01-08",
        "end": "2026-01-14",
        "type": "WEEKLY",
        "status": "OPEN"
      },
      "timesheet": {
        "id": "...",
        "regularHours": 32.0,
        "overtimeHours": 8.0,
        "doubleTimeHours": 0.0,
        "totalHours": 40.0,
        "status": "DRAFT",
        "exceptionsCount": 1,
        "exceptions": [{ "type": "MISSED_CLOCK_OUT", ... }],
        "calculatedAt": "2026-01-17T..."
      },
      "otBreakdown": {
        "byDay": [
          {
            "date": "2026-01-08",
            "regularHours": 8.0,
            "overtimeHours": 0.0,
            "doubleTimeHours": 0.0,
            "hasException": false
          }
        ],
        "totals": {
          "regular": 32.0,
          "overtime": 8.0,
          "doubleTime": 0.0,
          "total": 40.0
        }
      },
      "approvalsStatus": {
        "isApproved": false,
        "isSubmitted": false,
        "approvedBy": null,
        "approvedAt": null
      }
    }
  }
}
```

**Authentication:** Guard or Admin JWT token
**Middleware:** `authEither`, `requireAiPayrollEnabled`

---

### Payroll Adjustments Endpoints

#### `GET /api/admin/adjustments/pending`

Lists all pending adjustments (DRAFT, PENDING_APPROVAL).

**Response:**
```json
[
  {
    "id": "...",
    "guard_id": "...",
    "adjustment_type": "AI_SUGGESTED",
    "amount": -50.00,
    "description": "Correcting missed clock-out",
    "status": "PENDING_APPROVAL",
    "suggested_by_ai": true,
    "ai_suggestion_reason": "Timesheet shows 12 hours but time entries indicate 8 hours"
  }
]
```

**Authentication:** Admin JWT token
**Middleware:** `auth`, `requireRole(["admin"])`

---

#### `POST /api/admin/adjustments/:id/approve`

Approves a pending adjustment.

**Response:**
```json
{
  "ok": true,
  "adjustment": { ... }
}
```

**Status Codes:**
- `200` - Success
- `400` - Adjustment already approved/rejected/applied
- `404` - Adjustment not found

---

#### `POST /api/admin/adjustments/:id/reject`

Rejects a pending adjustment.

**Response:**
```json
{
  "ok": true,
  "adjustment": { ... }
}
```

---

#### `POST /api/admin/adjustments`

Creates a manual or AI-suggested adjustment.

**Request:**
```json
{
  "guard_id": "...",
  "pay_period_id": "...",
  "adjustment_type": "AI_SUGGESTED",
  "amount": -50.00,
  "description": "Correcting missed clock-out",
  "suggested_by_ai": true,
  "ai_suggestion_reason": "Timesheet discrepancy detected",
  "status": "PENDING_APPROVAL"
}
```

**Safety Guards:**
- AI-suggested adjustments must start as `DRAFT` or `PENDING_APPROVAL`
- Cannot be created with `APPROVED` or `APPLIED` status
- Requires admin approval before application

**Response:**
```json
{
  "ok": true,
  "adjustment": { ... }
}
```

---

#### `GET /api/admin/adjustments`

Lists all adjustments with optional filters.

**Query Parameters:**
- `guardId` - Filter by guard
- `payPeriodId` - Filter by pay period
- `status` - Filter by status
- `suggestedByAi` - Filter AI suggestions (true/false)

---

#### `GET /api/admin/adjustments/:id`

Gets a single adjustment by ID.

---

## Overtime Calculation Logic

### Daily Overtime

- **Regular:** First 8 hours
- **Overtime:** Hours between 8-12
- **Double-Time:** Hours after 12

**Example:**
- 10 hours worked → 8 regular + 2 overtime
- 14 hours worked → 8 regular + 4 overtime + 2 double-time

### Weekly Overtime

- **Weekly Threshold:** 40 hours
- **Weekly OT:** Hours beyond 40 in a week

**Priority:** Weekly OT takes precedence over daily OT. If weekly hours exceed 40, all subsequent hours in that week are OT (up to double-time threshold).

**Example:**
- Week total: 45 hours → First 40 regular, next 5 overtime (regardless of daily hours)

### Combined Logic

1. Calculate daily hours
2. Check if weekly threshold exceeded
3. If yes, apply weekly OT rules
4. If no, apply daily OT rules

---

## Exception Detection

### Exception Types

1. **NO_TIME_ENTRIES** - No time entries found for period
2. **MISSED_CLOCK_IN** - Missing clock-in time
3. **MISSED_CLOCK_OUT** - Missing clock-out time
4. **EXCESSIVE_HOURS** - Shift longer than 16 hours (potential error)

### Exception Structure

```javascript
{
  type: "MISSED_CLOCK_OUT",
  date: "2026-01-15",
  message: "Missing clock-out time",
  severity: "HIGH",
  time_entry_id: "...",
  hours?: 16.5  // For EXCESSIVE_HOURS
}
```

---

## Workflow

### 1. Timesheet Generation

```
Time Entries → Group by Date → Calculate Daily Hours → 
Calculate Weekly OT → Create Timesheet Lines → 
Detect Exceptions → Update Timesheet Totals
```

### 2. AI Payroll Assistant Flow

```
User Question → Get Pay Period → Get/Generate Timesheet → 
Fetch Timesheet Lines → Build OT Breakdown → 
Include in AI Context → AI Agent Processes → 
Return Answer + Context
```

### 3. Adjustment Approval Flow

```
AI Detects Discrepancy → Create Adjustment (DRAFT/PENDING_APPROVAL) → 
Admin Reviews → Approve/Reject → 
If Approved → Apply to Payroll (future: automatic application)
```

---

## Testing

### Run Test Script

```bash
cd /Users/ghaziabdullah/abe-guard-ai/backend
node src/scripts/testModeBImplementation.js
```

**Tests:**
1. Pay period creation/retrieval
2. Time entry check
3. AI payroll endpoint (Mode B)
4. Adjustment creation
5. Adjustment approval

### Manual Testing

#### 1. Create Pay Period

```sql
INSERT INTO pay_periods (id, tenant_id, period_start, period_end, period_type, status, created_at)
VALUES (
  gen_random_uuid(),
  'YOUR_TENANT_ID',
  '2026-01-08',
  '2026-01-14',
  'WEEKLY',
  'OPEN',
  NOW()
);
```

#### 2. Generate Timesheet

```javascript
const timesheetService = require("./services/timesheet.service");
const timesheet = await timesheetService.generateTimesheet(
  guardId,
  payPeriodId,
  tenantId
);
```

#### 3. Test AI Endpoint

```bash
curl -X POST http://localhost:4000/api/ai/payroll/ask \
  -H "Authorization: Bearer GUARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "What are my hours this week?"}'
```

---

## Safety Guards

### 1. AI Adjustment Approval

- AI-suggested adjustments **must** start as `DRAFT` or `PENDING_APPROVAL`
- Cannot be created with `APPROVED` or `APPLIED` status
- Enforced in `POST /api/admin/adjustments`

### 2. Status Transition Validation

- Cannot approve already approved/rejected/applied adjustments
- Cannot reject applied adjustments
- Prevents invalid state changes

### 3. Tenant Isolation

- Regular admins can only access their tenant's data
- Super admins can access any tenant (via query/header)

---

## Configuration

### Tenant Payroll Mode

Set tenant payroll mode via admin API:

```bash
PATCH /api/admin/tenants/:id/payroll-settings
{
  "payroll_mode": "CALCULATED",  // or "HYBRID" or "PAYSTUB_UPLOAD"
  "ai_payroll_enabled": true
}
```

### Overtime Thresholds

Default thresholds (can be customized in `payrollCalculator.service.js`):

- `dailyOT`: 8 hours
- `weeklyOT`: 40 hours
- `doubleTimeThreshold`: 12 hours/day

---

## Next Steps (Future Enhancements)

1. **Automatic Adjustment Application**
   - Apply approved adjustments automatically to payroll calculations

2. **Premium Hours Calculation**
   - Night shift premiums
   - Holiday premiums
   - Weekend premiums

3. **Pay Stub Generation from Timesheets**
   - Auto-generate pay stubs from calculated timesheets (Mode B)

4. **Notification System**
   - Notify guards when timesheet is calculated
   - Notify admins when adjustments need approval

5. **Audit Trail**
   - Track all changes to timesheets and adjustments

---

## Troubleshooting

### Issue: Timesheet not generating

**Check:**
1. Pay period exists and is OPEN
2. Time entries exist for the pay period date range
3. Time entries have valid `clock_in_at` and `clock_out_at`

### Issue: OT calculation incorrect

**Check:**
1. Time entries are correctly grouped by date
2. Weekly hours are calculated correctly
3. Thresholds are set correctly

### Issue: Exceptions not detected

**Check:**
1. Time entries have proper clock-in/out timestamps
2. `detectExceptions()` function is being called
3. Exception flags are set on timesheet lines

---

## Files Reference

### Models
- `/src/models/PayPeriod.js`
- `/src/models/Timesheet.js`
- `/src/models/TimesheetLine.js`
- `/src/models/PayrollAdjustment.js`

### Services
- `/src/services/payrollCalculator.service.js`
- `/src/services/timesheet.service.js`

### Routes
- `/src/routes/aiPayroll.routes.js`
- `/src/routes/adjustments.routes.js`

### Migrations
- `/src/migrations/20260117_000004_create_pay_periods.js`
- `/src/migrations/20260117_000005_create_timesheets.js`
- `/src/migrations/20260117_000006_create_timesheet_lines.js`
- `/src/migrations/20260117_000007_create_payroll_adjustments.js`

---

**Version:** 1.0.0  
**Last Updated:** January 2026
