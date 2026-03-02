# 📊 Dashboard Data Generation Explained

## Overview

The Guard Dashboard combines data from multiple database tables and calculates metrics, achievements, and streaks in real-time. Here's how each piece of data is generated:

---

## 🔍 Step 1: Data Collection

The backend queries **4 main database tables** in parallel:

### 1. **Shifts Table** (`public.shifts`)
```sql
SELECT id, shift_date, shift_start, shift_end, status, location, created_at
FROM public.shifts
WHERE guard_id = $1
ORDER BY shift_date DESC, shift_start DESC
```
**Returns**: All shifts assigned to the guard (past and future)

### 2. **Time Entries Table** (`public.time_entries`)
```sql
SELECT id, shift_id, clock_in_at, clock_out_at, lunch_start_at, lunch_end_at
FROM public.time_entries
WHERE guard_id = $1
ORDER BY clock_in_at DESC
```
**Returns**: All clock in/out records for the guard

### 3. **Callouts Table** (`public.callouts`)
```sql
SELECT id, shift_id, reason, created_at
FROM public.callouts
WHERE guard_id = $1
ORDER BY created_at DESC
```
**Returns**: All callouts created by the guard

### 4. **Guard Reputation Table** (`public.guard_reputation`) - Optional
```sql
SELECT trust_score, score, comment, created_at
FROM public.guard_reputation
WHERE guard_id = $1
ORDER BY created_at DESC
LIMIT 1
```
**Returns**: Latest reputation score (if available)

---

## 📈 Step 2: Performance Metrics Calculation

### **Reliability Score** (0-100%)
```javascript
Formula: (Completed Shifts / Total Assigned Shifts) × 100

Where:
- Completed Shifts = shifts with status = 'CLOSED' AND has clock_out_at in time_entries
- Total Assigned Shifts = all shifts where guard_id matches

Example:
- 95 completed shifts out of 100 assigned = 95% reliability
```

### **On-Time Percentage** (0-100%)
```javascript
Formula: (On-Time Clock-Ins / Total Clock-Ins) × 100

Where:
- On-Time = clock_in_at <= (shift_date + shift_start + 15 minutes buffer)
- Total Clock-Ins = all time_entries with clock_in_at

Example:
- 92 on-time clock-ins out of 100 total = 92% on-time
```

### **Callout Rate** (0-100%)
```javascript
Formula: (Callouts in Last 30 Days / Shifts in Last 30 Days) × 100

Where:
- Callouts = callouts created in the last 30 days
- Shifts = shifts assigned in the last 30 days
- Lower is better (0% = perfect attendance)

Example:
- 3 callouts out of 100 shifts = 3% callout rate
```

### **Completion Rate** (0-100%)
```javascript
Formula: (Shifts with Clock-Out / Shifts with Clock-In) × 100

Where:
- Shifts with Clock-Out = unique shift_ids in time_entries with clock_out_at
- Shifts with Clock-In = unique shift_ids in time_entries with clock_in_at

Example:
- 98 completed shifts out of 100 started = 98% completion rate
```

### **Overall Score**
```javascript
Formula: Average of (Reliability + On-Time + Completion + (100 - CalloutRate)) / 4

Example:
- Reliability: 95%
- On-Time: 92%
- Completion: 98%
- Callout Rate: 3% → (100 - 3) = 97%
- Overall: (95 + 92 + 98 + 97) / 4 = 92.5%
```

---

## 💰 Step 3: Earnings/Hours Calculation

### **Hours Calculation**
```javascript
For each time entry with clock_in_at AND clock_out_at:
  1. Calculate hours = (clock_out_at - clock_in_at) / (1000 * 60 * 60)
  2. If lunch break exists:
     - Calculate break hours = (lunch_end_at - lunch_start_at) / (1000 * 60 * 60)
     - Subtract break hours from total hours
  3. Add to total (ensuring no negative hours)

This Week: Sum of hours from entries in current week
This Month: Sum of hours from entries in current month
Total Hours: Sum of all completed entries
```

### **Upcoming Hours**
```javascript
For each upcoming shift (shift_date >= today AND status = 'OPEN' or has guard_id):
  1. Parse shift_start and shift_end times
  2. Calculate hours = (end_time - start_time) / 60
  3. Sum all upcoming shift hours
```

**Note**: Currently shows **hours** only. If hourly rate is available in the database, earnings can be calculated as `hours × hourly_rate`.

---

## 🏆 Step 4: Achievement Calculation

### **Perfect Attendance Badge**
```javascript
Criteria: No callouts in the last 30 days

Check:
- Filter callouts where created_at >= (today - 30 days)
- If count === 0 AND guard has shifts → Earned
```

### **On-Time Streak Badges**
```javascript
Criteria: Consecutive on-time clock-ins

Algorithm:
1. Get last 30 clock-ins (most recent first)
2. For each clock-in, check if on-time (within 15 min of shift start)
3. Count consecutive on-time clock-ins from most recent
4. Award badges:
   - 5 consecutive = 🟡 "5-Day On-Time Streak"
   - 10 consecutive = 🟠 "10-Day On-Time Streak"
   - 30 consecutive = 🔴 "30-Day On-Time Streak"
```

### **Shift Completion Milestones**
```javascript
Criteria: Total completed shifts

Count:
- Completed shifts = shifts with status = 'CLOSED' AND has clock_out_at

Badges:
- 10 shifts = 🥉 "10 Shifts Completed"
- 50 shifts = 🥈 "50 Shifts Completed"
- 100 shifts = 🥇 "100 Shifts Completed"
- 250 shifts = 💎 "250 Shifts Completed"
- 500 shifts = 👑 "500 Shifts Completed"
```

### **Reliability Badges**
```javascript
Criteria: Reliability score thresholds

Based on calculated reliabilityScore:
- 95%+ = ⭐ "Highly Reliable"
- 90%+ = ✅ "Reliable"
- 85%+ = 👍 "Dependable"
```

---

## 🔥 Step 5: Streak Calculation

### **On-Time Streak**
```javascript
Same algorithm as On-Time Streak badges:
- Count consecutive on-time clock-ins from most recent
- Returns current streak count
```

### **No Callouts Streak**
```javascript
Check:
- Filter callouts where created_at >= (today - 30 days)
- If count === 0 → Streak = 30 days
- Otherwise → Streak = 0
```

### **Attendance Streak**
```javascript
Algorithm:
1. Get all shifts with shift_date
2. Sort by date (most recent first)
3. Count unique dates with shifts
4. Return count (capped at 30 for display)
```

---

## 📅 Step 6: Upcoming Shifts

```javascript
Filter shifts where:
- shift_date >= today
- shift_date <= (today + 7 days)
- status = 'OPEN' OR guard_id matches

Sort by:
- shift_date ascending (earliest first)

Limit:
- Top 10 shifts

Format:
- Include: id, shift_date, shift_start, shift_end, location, status
```

---

## 🔄 Data Flow Diagram

```
┌─────────────────┐
│  Guard Login    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Dashboard Page │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  GET /api/guard/dashboard   │
│  (with guardToken in header) │
└────────┬─────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  guardAuth Middleware       │
│  - Verifies JWT token       │
│  - Extracts guardId         │
│  - Sets req.user.guardId    │
└────────┬─────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  guardDashboard Controller  │
│  - Queries 4 tables         │
│  - Calculates metrics       │
│  - Determines achievements  │
│  - Calculates streaks       │
└────────┬─────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Returns JSON Response      │
│  {                          │
│    upcomingShifts: [...],   │
│    performance: {...},      │
│    earnings: {...},         │
│    achievements: {...},     │
│    streaks: {...}           │
│  }                          │
└────────┬─────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  Frontend Dashboard         │
│  - Displays all sections    │
│  - Renders visualizations   │
└─────────────────────────────┘
```

---

## 🎯 Key Points

1. **Real-Time Calculation**: All metrics are calculated on-demand, not stored
2. **Last 30 Days**: Most metrics focus on recent performance (last 30 days)
3. **Parallel Queries**: All 4 database queries run simultaneously for performance
4. **Safe Defaults**: If data is missing, defaults to 100% or 0 (whichever makes sense)
5. **No Caching**: Data is fresh on every request (can be cached later if needed)

---

## 🔧 Customization Options

### To Change Time Periods:
- Edit the `thirtyDaysAgo` calculation in `calculatePerformanceMetrics()`
- Edit the `sevenDaysFromNow` calculation in `getUpcomingShifts()`

### To Add New Metrics:
- Add calculation function in controller
- Add to response object
- Display in frontend Dashboard component

### To Add New Badges:
- Add criteria check in `calculateAchievements()`
- Add badge object to `earned` or `inProgress` array

### To Include Earnings (if hourly rate available):
- Query hourly rate from `guards` table or `payroll` table
- Multiply hours by rate in `calculateEarnings()`
- Update frontend to display dollar amounts

---

## 📝 Example Calculation Walkthrough

**Guard has:**
- 100 assigned shifts (status = 'CLOSED')
- 95 completed shifts (have clock_out_at)
- 100 clock-ins total
- 92 on-time clock-ins
- 3 callouts in last 30 days
- 50 shifts in last 30 days

**Calculations:**
- Reliability: 95/100 = 95%
- On-Time: 92/100 = 92%
- Callout Rate: 3/50 = 6%
- Completion: 95/100 = 95%
- Overall: (95 + 92 + 95 + 94) / 4 = 94%

**Achievements:**
- ✅ "Reliable" (95% reliability)
- 🥇 "100 Shifts Completed" (if 100+ completed)
- 🟡 "5-Day On-Time Streak" (if 5+ consecutive on-time)
