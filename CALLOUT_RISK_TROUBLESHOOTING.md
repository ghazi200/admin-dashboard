# Callout Risk Troubleshooting

## Issue: Dashboard shows 0 High-Risk Shifts

### ✅ Fixes Applied:

1. **Location Parsing**: Now detects "New York Office" → "New York, NY"
2. **Weather Detection**: Detects snow storms and severe weather
3. **Risk Calculation**: HIGH external risk + base score >= 50 = HIGH_RISK
4. **Fallback Logic**: Northern states in winter = snow risk (if weather API fails)

### 🔍 Debugging Steps:

1. **Restart Backend Server** (CRITICAL!)
   ```bash
   # Stop current server (Ctrl+C)
   # Restart:
   cd backend
   npm start
   ```

2. **Check Backend Console Logs**
   When viewing Callout Risk page, you should see:
   ```
   📊 Calculating risks for X upcoming shifts...
   🔍 Processing shift...
   🌍 Checking external risk factors...
   📍 Parsed location - City: "New York", State: "NY"
   🌦️ External risk data: { riskLevel: "HIGH", ... }
   ⚠️ HIGH external risk detected! Adding 50 points to risk score.
   📊 Risk score breakdown:
      Base score: 45%
      External factors: 15%
      Total score: 60%
   ⚠️ HIGH_RISK recommendation due to severe external factors
   ```

3. **Check Browser Network Tab**
   - Open DevTools → Network
   - Filter by "callout-risk"
   - Check `/api/admin/callout-risk/upcoming` response
   - Look for shifts with `risk.recommendation === "HIGH_RISK"`

4. **Verify Shift Data**
   ```sql
   -- Check upcoming shifts
   SELECT id, shift_date, shift_start, location, guard_id, status
   FROM shifts
   WHERE shift_date >= CURRENT_DATE
     AND shift_date <= CURRENT_DATE + INTERVAL '7 days'
     AND guard_id IS NOT NULL
     AND status IN ('OPEN', 'CLOSED')
     AND location LIKE '%New York%';
   ```

5. **Test API Directly**
   ```bash
   # Get your admin token from browser localStorage
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5000/api/admin/callout-risk/upcoming?days=7
   ```

### Common Issues:

1. **Backend Not Restarted**
   - Fix: Restart backend server

2. **Shifts in Past**
   - Fix: Check `shift_date >= CURRENT_DATE`

3. **No Guard Assigned**
   - Fix: Ensure `guard_id IS NOT NULL`

4. **Wrong Status**
   - Fix: Shifts must be 'OPEN' or 'CLOSED'

5. **Location Not Set**
   - Fix: Ensure shifts have `location` field set

### Expected Behavior:

- **NY shifts in winter** → Should show HIGH_RISK
- **Base score 45% + External HIGH (snow) 15%** → Total 60% = HIGH_RISK
- **Dashboard should show**: "High-Risk Shifts: X" (where X > 0)

### If Still Not Working:

1. Check backend console for errors
2. Verify shifts exist in database with correct dates
3. Check API response in browser Network tab
4. Verify location parsing is working (check console logs)
5. Ensure weather service is returning HIGH risk (check logs)
