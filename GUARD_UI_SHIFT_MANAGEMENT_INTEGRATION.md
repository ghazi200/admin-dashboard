# Guard-UI Shift Management Integration Guide

## Overview

This guide provides instructions for integrating Shift Management features into the guard-ui application (port 3000).

---

## 📦 Components Created

### 1. **ShiftSwapMarketplace.jsx**
- Location: `frontend-admin-dashboard/admin-dashboard-frontend/src/components/guard-ui/ShiftSwapMarketplace.jsx`
- Features:
  - Browse available shift swaps
  - Post own shifts for swap
  - Accept swap requests
- Props: `guardId` (required)

### 2. **AvailabilityPreferences.jsx**
- Location: `frontend-admin-dashboard/admin-dashboard-frontend/src/components/guard-ui/AvailabilityPreferences.jsx`
- Features:
  - Set preferred days/times
  - Block unavailable dates
  - Set min/max hours per week
  - Location preferences
- Props: `guardId` (required)

---

## 🔧 Integration Steps

### Step 1: Copy Components to Guard-UI

1. Copy the components to your guard-ui project:
   ```bash
   # From admin-dashboard
   cp frontend-admin-dashboard/admin-dashboard-frontend/src/components/guard-ui/*.jsx ~/guard-ui/guard-ui/src/components/shift-management/
   ```

2. Copy API functions to guard-ui:
   ```bash
   # Copy the shift management API functions from:
   # frontend-admin-dashboard/admin-dashboard-frontend/src/services/api.js
   # Add to: ~/guard-ui/guard-ui/src/services/shiftManagement.api.js
   ```

### Step 2: Create API Service File

Create `~/guard-ui/guard-ui/src/services/shiftManagement.api.js`:

```javascript
import axios from 'axios';

// Configure axios for guard-ui
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('guardToken'); // Adjust based on your auth
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Shift Swap Marketplace
export const requestShiftSwap = (data) =>
  apiClient.post("/guards/shifts/swap/request", data);

export const getAvailableSwaps = (guardId) =>
  apiClient.get(`/guards/shifts/swap/available?guard_id=${guardId}`);

export const acceptShiftSwap = (swapId, guardId) =>
  apiClient.post(`/guards/shifts/swap/${swapId}/accept`, { guard_id: guardId });

// Availability Preferences
export const getAvailabilityPreferences = (guardId) =>
  apiClient.get(`/guards/availability/preferences?guard_id=${guardId}`);

export const updateAvailabilityPreferences = (data) =>
  apiClient.put("/guards/availability/preferences", data);

// Shift Reports
export const submitShiftReport = (shiftId, data) =>
  apiClient.post(`/guards/shifts/${shiftId}/report`, data);

export const getShiftReport = (shiftId) =>
  apiClient.get(`/guards/shifts/${shiftId}/report`);

// Shift History & Analytics
export const getShiftHistory = (guardId, params = {}) => {
  const queryParams = new URLSearchParams({ guard_id: guardId, ...params }).toString();
  return apiClient.get(`/guards/shifts/history?${queryParams}`);
};

export const getShiftAnalytics = (guardId, period = "month") =>
  apiClient.get(`/guards/shifts/analytics?guard_id=${guardId}&period=${period}`);
```

### Step 3: Update Component Imports

Update the component imports to use the guard-ui API service:

**ShiftSwapMarketplace.jsx:**
```javascript
// Change from:
import { requestShiftSwap, getAvailableSwaps, acceptShiftSwap } from "../../services/api";

// To:
import { requestShiftSwap, getAvailableSwaps, acceptShiftSwap } from "../../services/shiftManagement.api";
```

**AvailabilityPreferences.jsx:**
```javascript
// Change from:
import { getAvailabilityPreferences, updateAvailabilityPreferences } from "../../services/api";

// To:
import { getAvailabilityPreferences, updateAvailabilityPreferences } from "../../services/shiftManagement.api";
```

### Step 4: Add Routes to Guard-UI

Add routes in your guard-ui router (e.g., `App.js` or `routes.js`):

```javascript
import ShiftSwapMarketplace from './components/shift-management/ShiftSwapMarketplace';
import AvailabilityPreferences from './components/shift-management/AvailabilityPreferences';
import ShiftHistory from './components/shift-management/ShiftHistory';
import ShiftReportForm from './components/shift-management/ShiftReportForm';

// In your routes:
<Route path="/shifts/swap" element={<ShiftSwapMarketplace guardId={currentGuard.id} />} />
<Route path="/shifts/availability" element={<AvailabilityPreferences guardId={currentGuard.id} />} />
<Route path="/shifts/history" element={<ShiftHistory guardId={currentGuard.id} />} />
<Route path="/shifts/:id/report" element={<ShiftReportForm guardId={currentGuard.id} />} />
```

### Step 5: Add Navigation Links

Add links to your guard-ui navigation menu:

```javascript
<NavLink to="/shifts/swap">Shift Swaps</NavLink>
<NavLink to="/shifts/availability">Availability</NavLink>
<NavLink to="/shifts/history">Shift History</NavLink>
```

---

## 📝 Additional Components Needed

### 1. **ShiftHistory.jsx** (To Be Created)

```javascript
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getShiftHistory, getShiftAnalytics } from '../../services/shiftManagement.api';

export default function ShiftHistory({ guardId }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['shiftHistory', guardId],
    queryFn: () => getShiftHistory(guardId),
  });

  const { data: analytics } = useQuery({
    queryKey: ['shiftAnalytics', guardId],
    queryFn: () => getShiftAnalytics(guardId, 'month'),
  });

  // Render history list and analytics charts
  return (
    <div>
      <h2>Shift History</h2>
      {/* Implement history list */}
      <h3>Analytics</h3>
      {/* Implement analytics charts */}
    </div>
  );
}
```

### 2. **ShiftReportForm.jsx** (To Be Created)

```javascript
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { submitShiftReport } from '../../services/shiftManagement.api';

export default function ShiftReportForm({ guardId }) {
  const { id: shiftId } = useParams();
  const [form, setForm] = useState({
    notes: '',
    report_type: 'incident',
    photos: [],
  });

  const submitMutation = useMutation({
    mutationFn: (data) => submitShiftReport(shiftId, data),
    onSuccess: () => {
      alert('Report submitted successfully!');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    submitMutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Submit Shift Report</h2>
      {/* Implement form fields */}
    </form>
  );
}
```

---

## 🔐 Authentication

Ensure guard authentication is properly configured:

1. **Guard Token Storage:**
   - Store guard JWT token in `localStorage` or `sessionStorage`
   - Key: `guardToken` (or adjust based on your auth system)

2. **API Interceptor:**
   - The API service includes an interceptor to add the token to requests
   - Adjust the token key if needed

3. **Backend Middleware:**
   - Currently using `authAdmin` middleware as placeholder
   - Replace with guard authentication middleware when ready

---

## 🎨 Styling

The components use inline styles. To integrate with your guard-ui styling:

1. **Replace inline styles with CSS classes:**
   ```javascript
   // Instead of:
   <div style={{ padding: 20 }}>
   
   // Use:
   <div className="shift-management-container">
   ```

2. **Add CSS to your guard-ui stylesheet:**
   ```css
   .shift-management-container {
     padding: 20px;
   }
   
   .btn {
     /* Your button styles */
   }
   
   .badge {
     /* Your badge styles */
   }
   ```

---

## ✅ Testing Checklist

- [ ] Components copied to guard-ui
- [ ] API service file created
- [ ] Component imports updated
- [ ] Routes added to guard-ui router
- [ ] Navigation links added
- [ ] Guard authentication configured
- [ ] API endpoints tested
- [ ] Styling integrated
- [ ] Error handling tested
- [ ] Loading states working

---

## 🐛 Troubleshooting

### Issue: "401 Unauthorized"
- **Solution:** Check guard token is being sent in Authorization header
- Verify token is valid and not expired

### Issue: "404 Not Found"
- **Solution:** Verify API base URL is correct (`http://localhost:5000/api`)
- Check backend routes are registered

### Issue: "CORS Error"
- **Solution:** Ensure backend CORS is configured to allow guard-ui origin
- Add `http://localhost:3000` to CORS whitelist

### Issue: Components not rendering
- **Solution:** Check React Query is installed: `npm install @tanstack/react-query`
- Verify `guardId` prop is being passed correctly

---

## 📚 API Documentation

See `SHIFT_MANAGEMENT_IMPLEMENTATION.md` for complete API documentation.

---

## 🎉 Next Steps

1. Create remaining components (ShiftHistory, ShiftReportForm)
2. Add analytics charts/graphs
3. Integrate with notification system
4. Add photo upload functionality
5. Test end-to-end workflows

---

## 📞 Support

For issues or questions, refer to:
- Backend API docs: `SHIFT_MANAGEMENT_IMPLEMENTATION.md`
- Backend code: `backend/src/controllers/guardShiftManagement.controller.js`
