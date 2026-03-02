# 🎯 Guard Dashboard Implementation Plan
## Combining Upgrades #22, #23, and #34

### Overview
This implementation combines three related features into a unified **Guard Dashboard**:
- **#22: Personal Dashboard** - Overview of shifts, earnings, performance
- **#23: Performance Scorecard** - Detailed performance metrics
- **#34: Achievement Badges** - Gamification and engagement

### Why Combine Them?
These features are highly related and share data sources:
- All use shift history, time entries, and callout data
- Performance metrics feed into achievements
- Single page provides comprehensive guard self-service
- Better UX than three separate pages

---

## 📊 Data Sources & Calculations

### Available Data (from both backends):

#### From `abe-guard-ai` backend:
- **Shifts** (`shifts` table): `guard_id`, `shift_date`, `shift_start`, `shift_end`, `status`, `location`
- **Time Entries** (`time_entries` table): `clock_in_at`, `clock_out_at`, `lunch_start_at`, `lunch_end_at`
- **Callouts** (`callouts` table): `guard_id`, `created_at`, `reason`
- **Guard Reputation** (`guard_reputation` table): `trust_score`, `score`, `comment`

#### From `admin-dashboard` backend:
- **Payroll Data** (if available): Earnings, pay periods
- **Availability Logs** (`availability_logs` table): Availability history

---

## 🎯 Performance Metrics (Upgrade #23)

### 1. **Reliability Score** (0-100%)
```
Formula: (Completed Shifts / Total Assigned Shifts) × 100
- Completed = shifts with status = 'CLOSED' AND clock_out_at exists
- Total Assigned = shifts where guard_id = current guard
```

### 2. **On-Time Percentage** (0-100%)
```
Formula: (On-Time Clock-Ins / Total Clock-Ins) × 100
- On-Time = clock_in_at <= (shift_date + shift_start + 15 minutes buffer)
- Total Clock-Ins = time_entries with clock_in_at
```

### 3. **Callout Rate** (0-100%)
```
Formula: (Callouts Created / Total Assigned Shifts) × 100
- Callouts = callouts where guard_id = current guard
- Lower is better (0% = perfect attendance)
```

### 4. **Completion Rate** (0-100%)
```
Formula: (Shifts with clock_out_at / Shifts with clock_in_at) × 100
- Measures if guard completes shifts they start
```

---

## 💰 Earnings Summary (Upgrade #22)

### Calculations:
- **This Week**: Sum of hours from time_entries in current week × hourly rate (if available)
- **This Month**: Sum of hours from time_entries in current month × hourly rate
- **Total Hours**: Sum of all completed shift hours
- **Upcoming Earnings**: Estimated from upcoming assigned shifts

**Note**: If hourly rate is not in database, we'll calculate hours worked and show "Hours" instead of "Earnings"

---

## 🏆 Achievement Badges (Upgrade #34)

### Badge Types:

1. **Perfect Attendance**
   - Criteria: No callouts in last 30 days
   - Badge: 🟢 "Perfect Attendance"

2. **On-Time Streak**
   - Criteria: X consecutive on-time clock-ins
   - Badges:
     - 5 days: 🟡 "5-Day On-Time Streak"
     - 10 days: 🟠 "10-Day On-Time Streak"
     - 30 days: 🔴 "30-Day On-Time Streak"

3. **Shift Completion Milestones**
   - Criteria: Total completed shifts
   - Badges:
     - 10 shifts: 🥉 "10 Shifts Completed"
     - 50 shifts: 🥈 "50 Shifts Completed"
     - 100 shifts: 🥇 "100 Shifts Completed"
     - 250 shifts: 💎 "250 Shifts Completed"
     - 500 shifts: 👑 "500 Shifts Completed"

4. **Reliability Badges**
   - Criteria: Reliability score thresholds
   - Badges:
     - 95%+: ⭐ "Highly Reliable"
     - 90%+: ✅ "Reliable"
     - 85%+: 👍 "Dependable"

5. **Attendance Streak**
   - Criteria: Consecutive days with shifts
   - Badges:
     - 7 days: 🔥 "7-Day Streak"
     - 14 days: 🔥🔥 "14-Day Streak"
     - 30 days: 🔥🔥🔥 "30-Day Streak"

---

## 📱 Dashboard Layout

### Section 1: Quick Stats (Top Row)
- **Upcoming Shifts**: Count of assigned shifts in next 7 days
- **Hours This Week**: Total hours worked this week
- **Performance Score**: Overall score (average of reliability, on-time, completion)
- **Current Streak**: Longest active streak (attendance or on-time)

### Section 2: Performance Scorecard
- **Reliability Score**: Circular progress indicator
- **On-Time Percentage**: Circular progress indicator
- **Callout Rate**: Circular progress indicator (inverse - lower is better)
- **Completion Rate**: Circular progress indicator

### Section 3: Earnings Summary
- **This Week**: $XXX.XX (or XX hours)
- **This Month**: $XXX.XX (or XX hours)
- **Total Hours**: XXX hours
- **Upcoming**: Estimated earnings from upcoming shifts

### Section 4: Achievements & Badges
- Grid of earned badges
- Progress indicators for badges in progress
- Leaderboard position (optional)

### Section 5: Upcoming Shifts
- List of next 5-10 assigned shifts
- Date, time, location
- Quick actions (view details, clock in when available)

---

## 🔧 Implementation Steps

### Backend (abe-guard-ai):
1. Create `/api/guard/dashboard` endpoint
2. Calculate all performance metrics
3. Calculate earnings/hours
4. Determine earned badges
5. Return unified dashboard data

### Frontend (guard-ui):
1. Create `Dashboard.jsx` page component
2. Fetch dashboard data on mount
3. Display all sections with visual indicators
4. Add navigation link in sidebar
5. Style with modern UI components

---

## 📝 API Endpoint Specification

### `GET /api/guard/dashboard`

**Authentication**: Required (guardAuth middleware)

**Response**:
```json
{
  "upcomingShifts": [
    {
      "id": "uuid",
      "shift_date": "2024-01-15",
      "shift_start": "08:00:00",
      "shift_end": "16:00:00",
      "location": "Site A"
    }
  ],
  "performance": {
    "reliabilityScore": 95.5,
    "onTimePercentage": 92.0,
    "calloutRate": 3.2,
    "completionRate": 98.0,
    "overallScore": 92.0
  },
  "earnings": {
    "thisWeek": {
      "hours": 40.0,
      "amount": 800.00  // if hourly rate available
    },
    "thisMonth": {
      "hours": 160.0,
      "amount": 3200.00
    },
    "totalHours": 1200.0,
    "upcoming": {
      "hours": 24.0,
      "amount": 480.00
    }
  },
  "achievements": {
    "earned": [
      {
        "id": "perfect_attendance_30",
        "name": "Perfect Attendance",
        "icon": "🟢",
        "earnedAt": "2024-01-10T00:00:00Z"
      }
    ],
    "inProgress": [
      {
        "id": "on_time_streak_30",
        "name": "30-Day On-Time Streak",
        "progress": 25,
        "target": 30
      }
    ]
  },
  "streaks": {
    "attendance": 7,
    "onTime": 5,
    "noCallouts": 30
  }
}
```

---

## 🎨 UI Components Needed

1. **Circular Progress Indicators** - For performance metrics
2. **Badge Cards** - For achievements
3. **Stat Cards** - For quick stats
4. **Shift List** - For upcoming shifts
5. **Progress Bars** - For in-progress achievements

---

## ✅ Success Criteria

- [ ] Dashboard loads with all data
- [ ] Performance metrics calculate correctly
- [ ] Earnings/hours display accurately
- [ ] Badges earned correctly
- [ ] Upcoming shifts show correctly
- [ ] Responsive design (mobile-friendly)
- [ ] Real-time updates (when shifts change)

---

## 🚀 Next Steps

1. Review both backends ✅ (Done)
2. Create backend endpoint
3. Create frontend dashboard page
4. Add navigation
5. Test and refine
