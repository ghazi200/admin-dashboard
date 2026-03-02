# Step-by-Step: Upload Lunch Policy

## Current Status
✅ Guard: `bob@abe.com` 
✅ Tenant ID: `4941a27e-ea61-4847-b983-f56fb120f2aa` (ABE Security Company)
❌ Policy Documents: **NONE FOUND**

## Upload Steps

### 1. Go to Admin Dashboard
- URL: http://localhost:3001/policy
- Login if needed: `admin@test.com` / `password123`

### 2. Select Tenant
- **IMPORTANT**: Select **"ABE Security Company"** from the dropdown
- This tenant ID matches your guard's tenant

### 3. Fill in Upload Form
- **Title**: `Lunch Policy Test`
- **Category**: `breaks`
- **Visibility**: `guard` (or `all`)
- **Site**: Leave empty (tenant-wide)

### 4. Enter Policy Text
In the "Policy Content" textarea, paste:
```
Lunch Policy: All employees are entitled to a 30 minute paid break for lunch. This break is mandatory and must be taken during the assigned shift period. The lunch break is paid time and does not extend your work hours.
```

### 5. Click "Upload Policy"
- Wait for "Policy uploaded successfully" message
- The document should appear in the "Policy Documents" table

### 6. Verify Upload
- Check the table shows:
  - Title: "Lunch Policy Test"
  - Active: Should show "On" button (green)
  - Chunks: Should show a number > 0

### 7. If No Chunks
- Click **"Reindex"** button on the document
- Wait a few seconds
- Chunks should appear

### 8. Test in Guard UI
- Go to http://localhost:3000/ask-policy
- Login as `bob@abe.com` / `password123`
- Ask: **"what is the lunch policy"**
- Should return answer about "30 minute paid break"

## Troubleshooting

### Upload fails
- Check browser console for errors
- Verify tenant is selected
- Check backend logs for errors

### Document uploaded but no chunks
- Click "Reindex" button
- Check backend has `POLICY_AUTO_CHUNK=true` (default: true)
- Check backend logs

### Still can't find policy
- Verify tenant_id matches (must be `4941a27e-ea61-4847-b983-f56fb120f2aa`)
- Check document is Active (On)
- Check visibility is "guard" or "all"
- Run debug script: `cd ~/abe-guard-ai/backend && node DEBUG_POLICY_QUERY.js bob@abe.com`
