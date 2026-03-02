# 🔍 How to See Debug Logs

## The logs you're seeing (lines 871-930)
Those are **guard availability logs**, not overtime logs. The overtime debug logs will appear when you **create an overtime offer**.

## To See Overtime Debug Logs

### Step 1: Make sure backend is restarted
The debug logging was just added, so the backend needs to be restarted to load it.

### Step 2: Create an overtime offer
1. Go to Admin Dashboard
2. Find a guard with an active shift
3. Click "Offer Overtime"
4. Fill in the form and submit

### Step 3: Look for these log markers
The debug logs will have these markers:

```
================================================================================
🔍 CRITICAL DEBUG - OVERTIME OFFER CREATION
================================================================================
📋 Request Details: ...
📊 RAW DATABASE QUERY RESULT: ...
🔍 STEP 1: PARSING shift_end
🔍 STEP 2: SPLITTING INTO COMPONENTS
🔍 STEP 3: PARSED COMPONENTS
🔍 STEP 4: UTC CALCULATION
🔍 STEP 5: ROLLOVER HANDLING (or NO ROLLOVER)
🔍 STEP 6: FINAL RESULT
================================================================================
🔍 ABOUT TO INSERT INTO DATABASE
================================================================================
🔍 VALUES BEING BOUND TO INSERT QUERY
================================================================================
🔍 WHAT WAS ACTUALLY STORED IN DATABASE
================================================================================
```

## Where to Look

### If using terminal/console:
- Scroll up/down in the terminal where the backend is running
- Look for lines with `🔍` emoji
- The logs will be very detailed with `===` separators

### If logs are in a file:
- Check the log file location (usually configured in your server setup)
- Search for "CRITICAL DEBUG" or "OVERTIME OFFER CREATION"

## What the Logs Will Show

1. **What shift_end value is read** from database
2. **What hours value is parsed** (this is the critical one!)
3. **What UTC time is calculated**
4. **What is sent to PostgreSQL**
5. **What PostgreSQL actually stored**

This will tell us exactly where the 5-hour offset is being introduced!
