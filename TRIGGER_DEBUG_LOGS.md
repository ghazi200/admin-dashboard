# 🔍 How to Trigger Debug Logs

## Current Situation

The logs you're seeing (lines 588-597) are from:
- **Querying** overtime offers (GET request)
- **Guard availability** checks

These are **NOT** the debug logs we need!

## The Debug Logs We Need

The debug logs I added will **ONLY appear when you CREATE an overtime offer** (POST request), not when you query them.

## How to Trigger the Debug Logs

### Option 1: Via Admin Dashboard UI (Easiest)

1. **Go to Admin Dashboard** (http://localhost:3000)
2. **Find a guard** with an active shift (or use the test shift we created)
3. **Click "Offer Overtime"** button
4. **Fill in the form**:
   - Proposed end time (e.g., 6:00 PM)
   - Extension hours (e.g., 1.0)
5. **Click Submit**

**THEN** the backend console will show:
```
================================================================================
🔍 CRITICAL DEBUG - OVERTIME OFFER CREATION
================================================================================
📋 Request Details: ...
📊 RAW DATABASE QUERY RESULT: ...
🔍 STEP 1: PARSING shift_end
🔍 STEP 2: SPLITTING INTO COMPONENTS
🔍 STEP 3: PARSED COMPONENTS
  ⚠️  CRITICAL: hours value is X
🔍 STEP 4: UTC CALCULATION
🔍 STEP 5: ROLLOVER HANDLING
🔍 STEP 6: FINAL RESULT
================================================================================
🔍 ABOUT TO INSERT INTO DATABASE
================================================================================
🔍 VALUES BEING BOUND TO INSERT QUERY
================================================================================
🔍 WHAT WAS ACTUALLY STORED IN DATABASE
================================================================================
```

### Option 2: Via API Directly

```bash
curl -X POST http://localhost:5000/api/admin/overtime/offer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "shiftId": "d10f15da-9c36-4cd7-abf1-d95ac7525cb9",
    "guardId": "GUARD_UUID",
    "proposedEndTime": "2026-02-05T23:00:00.000Z",
    "extensionHours": 1.0
  }'
```

## What to Look For

When the debug logs appear, look for:

1. **`🔍 STEP 3: PARSED COMPONENTS`**
   - This shows the `hours` value
   - **This is the critical one!**
   - If `shift_end` is `05:00:00`, `hours` should be `5`
   - If `hours` is `10`, that's the bug!

2. **`🔍 STEP 6: FINAL RESULT`**
   - Shows what UTC time is calculated
   - Should match what's stored

3. **`🔍 WHAT WAS ACTUALLY STORED IN DATABASE`**
   - Shows if PostgreSQL changed the value
   - Compares sent vs stored

## Test Shift Available

We created a test shift:
- **Shift ID**: `d10f15da-9c36-4cd7-abf1-d95ac7525cb9`
- **Time**: 9 AM - 5 PM EST
- **Guard**: Bob Smith (bob@abe.com)

You can use this shift to test!
