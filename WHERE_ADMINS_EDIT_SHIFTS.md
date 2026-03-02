# 📍 Where Admins Edit Shifts in the Admin Dashboard

## Two Locations for Editing Shifts

Admins can edit shifts in **two different pages** in the admin dashboard:

---

## 1. 📋 **Shifts Page** (`/shifts`)

**Location**: Sidebar → **"Shifts"** link

**How to Edit**:
1. Navigate to `/shifts` page
2. Find the shift in the "All Shifts" table
3. Click the **"Edit"** button on the shift row
4. The form on the left side populates with the shift data
5. Modify any fields:
   - **Location** (text input)
   - **Date** (date picker)
   - **Start Time** (time input)
   - **End Time** (time input)
   - **Assign Guard** (dropdown)
6. Click **"Update Shift"** button

**Visual Layout**:
```
┌─────────────────────────────────────────────────────────┐
│  Shifts                                    [Refresh]    │
├──────────────────────┬──────────────────────────────────┤
│                      │                                  │
│  Edit Shift          │  All Shifts                      │
│  ┌────────────────┐  │  ┌────────────────────────────┐ │
│  │ Location:      │  │  │ Guard | Location | Start   │ │
│  │ [Main Office]  │  │  │ John  | Main     | 09:00  │ │
│  │                │  │  │       | Office    |        │ │
│  │ Date:         │  │  │ [Edit] [Delete]            │ │
│  │ [2024-01-15]  │  │  └────────────────────────────┘ │
│  │                │  │                                  │
│  │ Start Time:   │  │  (Table continues...)            │
│  │ [09:00]       │  │                                  │
│  │                │  │                                  │
│  │ End Time:     │  │                                  │
│  │ [17:00]       │  │                                  │
│  │                │  │                                  │
│  │ Assign Guard: │  │                                  │
│  │ [John Doe ▼]  │  │                                  │
│  │                │  │                                  │
│  │ [Update Shift]│  │                                  │
│  └────────────────┘  │                                  │
└──────────────────────┴──────────────────────────────────┘
```

**Code Location**: 
- File: `frontend-admin-dashboard/admin-dashboard-frontend/src/pages/Shifts.jsx`
- Function: `startEdit()` (line 74) - populates form
- Function: `submit()` (line 135) - calls `updateShift()` API

---

## 2. 📅 **Schedule Page** (`/schedule`)

**Location**: Sidebar → **"Schedule"** link (if visible, or navigate to `/schedule`)

**How to Edit**:
1. Navigate to `/schedule` page
2. Click the **"Edit"** button (top right of the page)
3. The schedule grid becomes editable
4. For each shift in the schedule:
   - **Start Time**: Click the time input field and change it
   - **End Time**: Click the time input field and change it
   - **Guard Assignment**: Use the dropdown to select/change guard
   - **Hours**: Edit the hours field (auto-calculated from times)
5. Click **"Save"** button to save all changes at once
6. Or click **"Cancel"** to discard changes

**Visual Layout**:
```
┌─────────────────────────────────────────────────────────┐
│  Schedule                          [Edit] [Save]        │
├─────────────────────────────────────────────────────────┤
│  Building: Main Office                                  │
│  Location: 123 Main St                                 │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Monday                                              │ │
│  │ ┌──────────┬──────────┬──────────┬──────────────┐ │ │
│  │ │ Time     │ Guard    │ Hours    │ Actions      │ │ │
│  │ ├──────────┼──────────┼──────────┼──────────────┤ │ │
│  │ │ [09:00]  │ [John ▼] │ [8.0]    │ [Remove]     │ │ │
│  │ │   to     │          │          │              │ │ │
│  │ │ [17:00]  │          │          │              │ │ │
│  │ └──────────┴──────────┴──────────┴──────────────┘ │ │
│  │ [+ Add Shift]                                      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Tuesday                                                 │
│  (Similar grid...)                                       │
│                                                          │
│  ... (rest of week)                                      │
└─────────────────────────────────────────────────────────┘
```

**Code Location**:
- File: `frontend-admin-dashboard/admin-dashboard-frontend/src/pages/Schedule.jsx`
- Function: `updateShiftTime()` (line 316) - updates start/end times
- Function: `updateGuardAssignment()` (line 310) - changes guard
- Function: `handleSave()` (line 275) - saves all changes via `updateSchedule()` API

**Key Functions**:
```javascript
// Update shift start or end time
updateShiftTime(dayIndex, shiftIndex, "start", "10:00")
updateShiftTime(dayIndex, shiftIndex, "end", "18:00")

// Update guard assignment
updateGuardAssignment(dayIndex, shiftIndex, "John Doe")

// Save all changes
handleSave() // Calls updateSchedule() API
```

---

## 🔄 How Shift Change Alerts Are Triggered

### From Shifts Page (`/shifts`)

**Flow**:
```
Admin clicks "Edit" → Fills form → Clicks "Update Shift"
    ↓
Frontend calls: updateShift(shiftId, payload)
    ↓
Backend: adminShifts.controller.js → updateShift()
    ↓
1. Captures "before" state
2. Executes UPDATE query
3. Captures "after" state
4. Calls notifyShiftChanges() helper
    ↓
Detects changes → Creates notifications → Emits socket events
```

### From Schedule Page (`/schedule`)

**Flow**:
```
Admin clicks "Edit" → Modifies shifts in grid → Clicks "Save"
    ↓
Frontend calls: updateSchedule({ scheduleTemplate: editedSchedule })
    ↓
Backend: (needs to check which controller handles this)
    ↓
For each shift in the schedule:
  - If shift time changed → Creates SHIFT_TIME_CHANGED notification
  - If guard changed → Creates SHIFT_ASSIGNED/SHIFT_UNASSIGNED notification
  - If shift deleted → Creates SHIFT_CANCELLED notification
```

**Note**: The Schedule page uses `updateSchedule()` which may batch update multiple shifts. The shift change detection should handle this by comparing each shift's before/after state.

---

## 🎯 Which Page to Use?

| Feature | Shifts Page | Schedule Page |
|---------|------------|---------------|
| **Best for** | Individual shift edits | Bulk schedule editing |
| **View** | Table/list format | Calendar/week view |
| **Edit Mode** | Inline form | Grid editing |
| **Bulk Changes** | One at a time | Multiple shifts at once |
| **Visual Context** | List of all shifts | Weekly schedule layout |

---

## 📝 Summary

**Shifts Page** (`/shifts`):
- ✅ Better for quick individual edits
- ✅ Shows all shifts in a table
- ✅ Direct edit form on the left

**Schedule Page** (`/schedule`):
- ✅ Better for viewing weekly schedule
- ✅ Edit multiple shifts in one view
- ✅ See guard assignments across the week
- ✅ Visual calendar layout

Both pages trigger the same shift change detection system, so guards will receive notifications regardless of which page the admin uses to make changes! 🎯
