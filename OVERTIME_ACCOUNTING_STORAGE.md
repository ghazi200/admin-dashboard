# 📊 Overtime Storage for Accounting

## Overview

Overtime hours are tracked and stored in multiple database tables for accounting and payroll purposes. Here's where everything is stored:

---

## 🗄️ Database Tables

### 1. **`time_entries`** (Source Data)
**Location**: Raw clock in/out records

```sql
SELECT 
  id, 
  guard_id, 
  shift_id,
  clock_in_at, 
  clock_out_at, 
  lunch_start_at, 
  lunch_end_at
FROM time_entries
WHERE guard_id = $1
```

**Purpose**: 
- Stores actual clock in/out timestamps
- Used to calculate total hours worked
- **This is the source of truth** for hours worked

**Overtime Calculation**: Overtime is **calculated** from these entries, not stored directly here.

---

### 2. **`timesheets`** (Calculated Breakdown)
**Location**: Pay period summary with overtime breakdown

```sql
SELECT 
  id,
  guard_id,
  pay_period_id,
  regular_hours,        -- ✅ Regular hours (first 8/day, first 40/week)
  overtime_hours,      -- ✅ Overtime hours (8-12/day or >40/week)
  double_time_hours,   -- ✅ Double-time hours (>12/day)
  total_hours,         -- Total hours worked
  status               -- DRAFT, LOCKED, APPROVED
FROM timesheets
WHERE guard_id = $1
```

**Purpose**:
- **Primary storage for overtime breakdown** for accounting
- Calculated from `time_entries` using `payrollCalculator.service.js`
- One timesheet per guard per pay period
- Contains the **regular vs overtime vs double-time breakdown**

**Overtime Calculation Logic**:
- **Daily OT**: Hours > 8 per day (up to 12 hours)
- **Weekly OT**: Hours > 40 per week (takes precedence)
- **Double-Time**: Hours > 12 per day

---

### 3. **`timesheet_lines`** (Daily Breakdown)
**Location**: Day-by-day breakdown within a timesheet

```sql
SELECT 
  id,
  timesheet_id,
  date,
  regular_hours,        -- ✅ Regular hours for this day
  overtime_hours,       -- ✅ Overtime hours for this day
  double_time_hours,    -- ✅ Double-time hours for this day
  premium_hours,        -- Premium pay hours (holidays, etc.)
  premium_type,         -- Type of premium (HOLIDAY, etc.)
  has_exception,        -- Exception flag
  exception_type        -- Type of exception
FROM timesheet_lines
WHERE timesheet_id = $1
ORDER BY date
```

**Purpose**:
- **Daily breakdown** of regular/overtime/double-time hours
- Used for detailed payroll reports
- Shows which days had overtime

---

### 4. **`pay_stubs`** (Final Pay Stub)
**Location**: Final pay stub records (uploaded or generated)

```sql
SELECT 
  id,
  guard_id,
  pay_period_start,
  pay_period_end,
  pay_date,
  hours_worked,         -- ⚠️ Total hours only (no breakdown)
  gross_amount,        -- Total gross pay
  tax_amount,
  deductions_amount,
  net_amount,
  file_url             -- PDF pay stub file
FROM pay_stubs
WHERE guard_id = $1
```

**Purpose**:
- Final pay stub records
- **Note**: Only stores `hours_worked` (total), not the breakdown
- The breakdown is in the `timesheets` table

---

### 5. **`overtime_offers`** (Requests/Offers)
**Location**: Overtime requests and offers (not actual hours)

```sql
SELECT 
  id,
  guard_id,
  shift_id,
  extension_hours,     -- ⚠️ Proposed extension, not actual hours
  status,              -- pending, accepted, declined, requested
  proposed_end_time,
  current_end_time,
  created_at
FROM overtime_offers
WHERE guard_id = $1
```

**Purpose**:
- Tracks **overtime requests/offers** (workflow)
- **NOT** the actual hours worked
- When accepted, the shift's `shift_end` is updated
- Actual hours are calculated from `time_entries` when the guard clocks out

---

## 🔄 Data Flow

### How Overtime Gets Stored:

```
1. Guard clocks in/out
   ↓
   time_entries table (clock_in_at, clock_out_at)

2. Payroll calculation runs
   ↓
   payrollCalculator.service.js calculates:
   - Regular hours (first 8/day, first 40/week)
   - Overtime hours (8-12/day or >40/week)
   - Double-time hours (>12/day)
   ↓
   timesheets table (regular_hours, overtime_hours, double_time_hours)
   timesheet_lines table (daily breakdown)

3. Pay stub generation
   ↓
   pay_stubs table (hours_worked = total, breakdown in timesheets)
```

---

## 📍 Where to Find Overtime for Accounting

### For Payroll Reports:
```sql
-- Get overtime breakdown for a guard in a pay period
SELECT 
  t.regular_hours,
  t.overtime_hours,
  t.double_time_hours,
  t.total_hours,
  pp.period_start,
  pp.period_end
FROM timesheets t
JOIN pay_periods pp ON t.pay_period_id = pp.id
WHERE t.guard_id = $1
  AND pp.status = 'LOCKED'  -- Or 'APPROVED'
ORDER BY pp.period_start DESC;
```

### For Daily Breakdown:
```sql
-- Get day-by-day overtime breakdown
SELECT 
  tl.date,
  tl.regular_hours,
  tl.overtime_hours,
  tl.double_time_hours,
  tl.premium_hours,
  tl.premium_type
FROM timesheet_lines tl
JOIN timesheets t ON tl.timesheet_id = t.id
WHERE t.guard_id = $1
  AND t.status = 'LOCKED'
ORDER BY tl.date DESC;
```

### For Current Period (Real-time):
```sql
-- Get current pay period overtime status
SELECT 
  SUM(regular_hours) as regular,
  SUM(overtime_hours) as overtime,
  SUM(double_time_hours) as double_time,
  SUM(total_hours) as total
FROM timesheets
WHERE guard_id = $1
  AND status = 'DRAFT'  -- Current period
```

---

## ⚠️ Important Notes

1. **`overtime_offers` table is NOT for accounting**
   - It only tracks requests/offers (workflow)
   - Actual hours come from `time_entries` → `timesheets`

2. **`pay_stubs` table has limited data**
   - Only stores total `hours_worked`
   - Breakdown is in `timesheets` and `timesheet_lines`

3. **Overtime is calculated, not stored directly**
   - Calculated from `time_entries` using thresholds:
     - Daily OT: > 8 hours/day
     - Weekly OT: > 40 hours/week
     - Double-Time: > 12 hours/day

4. **Timesheets are the source of truth for accounting**
   - `timesheets.regular_hours`
   - `timesheets.overtime_hours`
   - `timesheets.double_time_hours`

---

## 🔧 Services That Handle Overtime

1. **`payrollCalculator.service.js`**
   - Calculates regular/overtime/double-time from time entries
   - Uses thresholds (daily: 8h, weekly: 40h, double-time: 12h)

2. **`timesheet.service.js`**
   - Generates/updates timesheets from time entries
   - Creates timesheet_lines for daily breakdown

3. **`overtimeStatus.service.js`**
   - Real-time overtime status for guards (UI display)
   - Not stored, calculated on-the-fly

---

## 📊 Summary

**For Accounting/Payroll, use:**
- ✅ **`timesheets`** table - Primary source for overtime breakdown
- ✅ **`timesheet_lines`** table - Daily breakdown
- ✅ **`time_entries`** table - Source data (raw clock in/out)

**NOT for accounting:**
- ❌ **`overtime_offers`** - Only workflow/requests
- ⚠️ **`pay_stubs`** - Only total hours (breakdown in timesheets)
