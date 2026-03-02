# 🧪 Testing Announcements Feature

## Quick Test Steps

### 1. Verify Backend is Running
```bash
# Check abe-guard-ai backend (port 4000)
curl http://localhost:4000/health
# Should return: {"status":"OK"}

# Check admin-dashboard backend (port 5000)
curl http://localhost:5000/health
# Should return: {"status":"OK"}
```

### 2. Test from Browser Console

1. **Open Admin Dashboard** in your browser (http://localhost:3001 or http://localhost:3000)
2. **Login** if not already logged in
3. **Open Browser Console** (F12 → Console tab)
4. **Run these tests:**

#### Test 1: List Announcements
```javascript
// Get your admin token
const token = localStorage.getItem('adminToken');
console.log('Token:', token ? 'Found' : 'Not found');

// Test listing announcements
fetch('http://localhost:4000/api/admin/announcements', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  console.log('✅ Announcements:', data);
  console.log('Count:', data.data?.length || data.length || 0);
})
.catch(err => console.error('❌ Error:', err));
```

#### Test 2: Create Announcement
```javascript
const token = localStorage.getItem('adminToken');

fetch('http://localhost:4000/api/admin/announcements', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Test Announcement',
    message: 'This is a test announcement created from the browser console.',
    category: 'COMPANY_WIDE',
    priority: 'MEDIUM'
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Created:', data);
  console.log('ID:', data.data?.id || data.id);
})
.catch(err => console.error('❌ Error:', err));
```

#### Test 3: Update Announcement
```javascript
const token = localStorage.getItem('adminToken');
const announcementId = 'YOUR_ANNOUNCEMENT_ID'; // Replace with actual ID

fetch(`http://localhost:4000/api/admin/announcements/${announcementId}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    priority: 'HIGH',
    message: 'Updated message'
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Updated:', data);
})
.catch(err => console.error('❌ Error:', err));
```

#### Test 4: Delete Announcement
```javascript
const token = localStorage.getItem('adminToken');
const announcementId = 'YOUR_ANNOUNCEMENT_ID'; // Replace with actual ID

fetch(`http://localhost:4000/api/admin/announcements/${announcementId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  console.log('✅ Deleted:', data);
})
.catch(err => console.error('❌ Error:', err));
```

### 3. Test from Admin Dashboard UI

1. **Navigate to Announcements**:
   - Click "📢 Announcements" in the sidebar
   - Or go to: http://localhost:3001/announcements

2. **Create an Announcement**:
   - Fill in the form on the left
   - Title: "Test Announcement"
   - Message: "This is a test"
   - Select Category and Priority
   - Click "Create Announcement"

3. **Verify**:
   - Announcement should appear in the list on the right
   - You should see a success message

4. **Edit an Announcement**:
   - Click "Edit" on any announcement
   - Modify the fields
   - Click "Update Announcement"

5. **Delete an Announcement**:
   - Click "Delete" on any announcement
   - Confirm the deletion
   - Announcement should be deactivated

### 4. Verify in Guard UI

1. **Open Guard UI** (http://localhost:3000)
2. **Login as a guard**
3. **Check Announcements**:
   - Announcements should appear in the guard UI
   - Active announcements should be visible
   - Guards can mark them as read

### 5. Database Verification

```bash
cd ~/abe-guard-ai/backend
node -e "
require('dotenv').config();
const { pool } = require('./src/config/db');
pool.query('SELECT id, title, category, priority, is_active, created_at FROM public.announcements ORDER BY created_at DESC LIMIT 5')
  .then(r => {
    console.log('Recent announcements:');
    r.rows.forEach(row => {
      console.log(\`  - \${row.title} (\${row.category}, \${row.priority}, \${row.is_active ? 'Active' : 'Inactive'})\`);
    });
    pool.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    pool.end();
  });
"
```

## Expected Results

✅ **Success Indicators:**
- Announcements page loads without errors
- Can create new announcements
- Can edit existing announcements
- Can delete (deactivate) announcements
- Announcements appear in guard UI
- No console errors

❌ **Issues to Watch For:**
- 401 Unauthorized errors (token issue)
- 404 Not Found (route not mounted)
- 500 Server Error (backend issue)
- CORS errors (check backend CORS config)
- "Failed to load announcements" in UI

## Troubleshooting

### Issue: 401 Unauthorized
- **Solution**: Make sure you're logged in to admin dashboard
- Check that `adminToken` exists in localStorage
- Token might be expired - try logging out and back in

### Issue: 404 Not Found
- **Solution**: Check that announcements routes are mounted in `abe-guard-ai/backend/src/app.js`
- Verify route: `/api/admin/announcements`

### Issue: CORS Error
- **Solution**: Check CORS configuration in `abe-guard-ai/backend/src/app.js`
- Make sure `http://localhost:3001` is in allowed origins

### Issue: Database Error
- **Solution**: Verify announcements tables exist:
  ```bash
  cd ~/abe-guard-ai/backend
  node -e "require('dotenv').config(); const { pool } = require('./src/config/db'); pool.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('announcements', 'announcement_reads')\").then(r => { console.log('Tables:', r.rows.map(x => x.table_name)); pool.end(); });"
  ```
