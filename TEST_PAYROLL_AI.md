# Testing AI Pay Stub Explanation

## Test Steps

### 1. Verify Backend is Running
```bash
cd ~/abe-guard-ai/backend
# Make sure server is running on port 4000
```

### 2. Get Guard Token
```bash
# Use existing guard token or create one
# Token should be in localStorage or create via:
cd ~/abe-guard-ai/backend
node ../../admin-dashboard/CREATE_GUARD_TOKEN.js bob@abe.com password123
```

### 3. Test Pay Stub Endpoint
```bash
# Test if pay stubs are accessible
curl -X GET http://localhost:4000/api/guard/paystubs \
  -H "Authorization: Bearer YOUR_GUARD_TOKEN" \
  -H "Content-Type: application/json"
```

### 4. Test AI Payroll Question
```bash
# Test AI explanation
curl -X POST http://localhost:4000/api/ai/payroll/ask \
  -H "Authorization: Bearer YOUR_GUARD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Show me my most recent pay stub and explain it"
  }'
```

### 5. Test in Browser
1. Go to http://localhost:3000/payroll
2. Login as guard
3. Ask: "Show me my most recent pay stub and explain it"
4. Verify:
   - Pay stub card appears
   - AI answer is displayed
   - Answer explains the pay stub details

## Expected Results

### With OpenAI API Key:
- AI generates detailed explanation
- Answer references specific numbers from pay stub
- Professional, helpful tone

### Without OpenAI API Key:
- Fallback structured response
- Still explains pay stub clearly
- Shows all pay stub details

## Troubleshooting

### No pay stubs found:
- Admin needs to upload pay stub first
- Check tenant_id matches between guard and pay stub

### AI not working:
- Check OPENAI_API_KEY in .env
- Verify OpenAI package is installed
- Check backend logs for errors

### Pay stub not displaying:
- Check payroll mode (PAYSTUB_UPLOAD or HYBRID)
- Verify guard has pay stubs in database
- Check browser console for errors
