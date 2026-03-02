# 🧪 Next Test Steps

## ✅ Test Shift Created

**Shift ID**: `d10f15da-9c36-4cd7-abf1-d95ac7525cb9`
- **Guard**: Bob Smith (bob@abe.com)
- **Date**: 2026-02-05
- **Time**: 09:00:00 - 17:00:00 (9 AM - 5 PM EST)
- **Status**: OPEN

## ✅ Calculation Test Passed

The code calculation test shows:
- ✅ Reads `shift_end: 17:00:00` correctly
- ✅ Calculates: `17 + 5 = 22:00 UTC` ✅
- ✅ Should display as `5:00 PM EST` ✅

**This means the code SHOULD work correctly!**

---

## 🧪 Next Step: Create Overtime Offer

### Via Admin Dashboard UI:

1. **Go to Admin Dashboard**
2. **Find the test shift** (or use the guard's name: Bob Smith)
3. **Click "Offer Overtime"** button
4. **Set proposed end time** (e.g., 6:00 PM = 18:00:00 EST)
5. **Submit the offer**

### Then Check Database:

```sql
SELECT 
  id,
  current_end_time,
  proposed_end_time,
  created_at
FROM overtime_offers 
WHERE shift_id = 'd10f15da-9c36-4cd7-abf1-d95ac7525cb9'
ORDER BY created_at DESC 
LIMIT 1;
```

### Expected Results:

**If Code is Working** ✅:
- `current_end_time`: `2026-02-05T22:00:00.000Z` (22:00 UTC)
- `proposed_end_time`: `2026-02-05T23:00:00.000Z` (23:00 UTC for 6 PM EST)

**If Code is Broken** ❌:
- `current_end_time`: Wrong value (not 22:00 UTC)
- `proposed_end_time`: Wrong value

---

## What This Will Tell Us

### Scenario A: Database Shows Correct Times ✅
- **Meaning**: Code is working correctly
- **Conclusion**: Issue was specific to the previous shift
- **Action**: Use new shift going forward, or investigate why previous shift had issues

### Scenario B: Database Shows Wrong Times ❌
- **Meaning**: Code is not being executed correctly
- **Possible Causes**:
  1. Different code path being used
  2. Server not restarted with new code
  3. Caching issue
  4. Database query returning wrong value
- **Action**: Debug backend logs to see what's happening

---

## Quick Database Check Command

After creating the offer, run:

```bash
cd /Users/ghaziabdullah/admin-dashboard/backend
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/^DATABASE_URL=(.+)$/m);
const databaseUrl = match[1].trim();

const pool = new Pool({ connectionString: databaseUrl });

(async () => {
  const shiftId = 'd10f15da-9c36-4cd7-abf1-d95ac7525cb9';
  const result = await pool.query(
    \`SELECT current_end_time, proposed_end_time, created_at
     FROM overtime_offers
     WHERE shift_id = \$1::uuid
     ORDER BY created_at DESC LIMIT 1\`,
    [shiftId]
  );
  
  if (result.rows.length > 0) {
    const offer = result.rows[0];
    const currentEnd = new Date(offer.current_end_time);
    const proposedEnd = new Date(offer.proposed_end_time);
    
    console.log('=== OVERTIME OFFER RESULTS ===');
    console.log('Created:', offer.created_at);
    console.log('');
    console.log('STORED VALUES:');
    console.log('  current_end_time:', offer.current_end_time);
    console.log('  proposed_end_time:', offer.proposed_end_time);
    console.log('');
    console.log('UTC HOURS:');
    console.log('  current_end_time UTC:', currentEnd.getUTCHours() + ':00');
    console.log('  proposed_end_time UTC:', proposedEnd.getUTCHours() + ':00');
    console.log('');
    console.log('EST DISPLAY:');
    console.log('  current_end_time EST:', currentEnd.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }));
    console.log('  proposed_end_time EST:', proposedEnd.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }));
    console.log('');
    console.log('EXPECTED:');
    console.log('  current_end_time: 22:00 UTC (5 PM EST)');
    console.log('  proposed_end_time: 23:00 UTC (6 PM EST) if extending 1 hour');
    console.log('');
    
    if (currentEnd.getUTCHours() === 22) {
      console.log('✅ CORRECT: current_end_time is 22:00 UTC');
    } else {
      console.log('❌ WRONG: current_end_time is', currentEnd.getUTCHours() + ':00 UTC (expected 22:00)');
    }
  } else {
    console.log('No overtime offer found for this shift yet.');
    console.log('Please create an overtime offer via admin dashboard first.');
  }
  
  await pool.end();
})();
"
```

---

## Summary

✅ **Test shift created**: `d10f15da-9c36-4cd7-abf1-d95ac7525cb9`
✅ **Calculation test passed**: Code produces correct UTC time
🧪 **Next**: Create overtime offer and check database

This will definitively tell us if the issue is:
- Code-wide (new shift also fails)
- Shift-specific (new shift works)
