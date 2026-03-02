# 🔔 Shift Change Alerts System - How It Works

## Overview

The Shift Change Alerts system automatically notifies guards in real-time when their shifts are modified, cancelled, or assigned. This ensures guards are always aware of schedule changes without needing to constantly check their schedule.

---

## 🏗️ System Architecture

### Components

1. **Database Layer** (`guard_notifications` table in `abe_guard` database)
   - Stores all notifications with metadata
   - Tracks read/unread status
   - Links to shifts and guards

2. **Backend Detection** (admin-dashboard backend)
   - Monitors shift create/update/delete operations
   - Compares before/after states to detect changes
   - Creates appropriate notifications

3. **Real-time Communication** (Socket.IO)
   - Emits events to guard-specific rooms
   - Enables instant notification delivery

4. **Frontend Display** (guard-ui)
   - Fetches notifications via API
   - Displays in a dedicated component
   - Auto-refreshes every 30 seconds

---

## 📊 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADMIN DASHBOARD                              │
│  Admin updates shift (time, date, location, assignment, etc.)  │
└──────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│           ADMIN-DASHBOARD BACKEND (Port 5000)                   │
│                                                                  │
│  1. adminShifts.controller.js                                  │
│     └─> updateShift() / createShift() / deleteShift()          │
│                                                                  │
│  2. Capture "before" state:                                     │
│     - guard_id, shift_date, shift_start, shift_end, location   │
│                                                                  │
│  3. Execute shift update/delete                                 │
│                                                                  │
│  4. Capture "after" state                                       │
│                                                                  │
│  5. Call notifyShiftChanges() helper                            │
│     └─> Compare before vs after                                 │
│     └─> Detect changes:                                         │
│         • Guard assigned (was null, now has guard_id)            │
│         • Guard unassigned (had guard_id, now null)             │
│         • Time changed (shift_start or shift_end different)     │
│         • Date changed (shift_date different)                  │
│         • Location changed (location different)                │
│         • Status changed to CANCELLED                          │
└──────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│         guardNotification.js Helper Function                    │
│                                                                  │
│  For each detected change:                                      │
│                                                                  │
│  1. createGuardNotification()                                   │
│     ├─> Insert into guard_notifications table                   │
│     │   (abe_guard database, shared by both backends)          │
│     │                                                            │
│     └─> Emit Socket.IO event                                    │
│         io.to(`guard:${guardId}`).emit(                         │
│           "guard:notification:new",                              │
│           notification                                          │
│         )                                                       │
└──────────────────────────┬──────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌──────────────────────┐          ┌──────────────────────────────┐
│   DATABASE           │          │   SOCKET.IO SERVER           │
│   (abe_guard)        │          │   (abe-guard-ai:4000)         │
│                      │          │                              │
│ guard_notifications  │          │  Guard connected to room:    │
│ ┌──────────────────┐│          │  "guard:{guardId}"           │
│ │ id (UUID)        ││          │                              │
│ │ guard_id (UUID)  ││          │  Event:                      │
│ │ type             ││          │  "guard:notification:new"    │
│ │ title            ││          │                              │
│ │ message          ││          │  Payload: notification obj   │
│ │ shift_id         ││          │                              │
│ │ read_at          ││          │  ────────────────────────────│
│ │ meta (JSONB)     ││          │  Real-time delivery! ⚡       │
│ │ created_at       ││          │                              │
│ └──────────────────┘│          └──────────────────────────────┘
└──────────────────────┘
        │
        │ (API Polling - every 30s)
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│              ABE-GUARD-AI BACKEND (Port 4000)                    │
│                                                                  │
│  API Endpoints:                                                 │
│  • GET /api/guard/notifications                                 │
│  • GET /api/guard/notifications/unread-count                    │
│  • POST /api/guard/notifications/:id/read                       │
│  • POST /api/guard/notifications/mark-all-read                  │
└──────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GUARD-UI FRONTEND                            │
│                                                                  │
│  ShiftNotifications Component:                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. On mount: Fetch notifications via API                  │  │
│  │ 2. Display notifications with icons and badges            │  │
│  │ 3. Auto-refresh every 30 seconds                         │  │
│  │ 4. Mark as read when guard clicks ✓                       │  │
│  │ 5. Show unread count badge                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Displayed on Home page at top of cards section                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Detailed Step-by-Step Example

### Scenario: Admin Changes Shift Time

**Step 1: Admin Action**
- Admin opens shift management page
- Changes shift time from `09:00-17:00` to `10:00-18:00`
- Clicks "Save"

**Step 2: Backend Receives Request**
```javascript
// adminShifts.controller.js - updateShift()
POST /api/admin/shifts/:id
Body: { shift_start: "10:00", shift_end: "18:00" }
```

**Step 3: Capture Before State**
```javascript
// Query current shift data
SELECT status, guard_id, shift_date, shift_start, shift_end, location 
FROM shifts WHERE id = $1

// Store:
previousShiftStart = "09:00"
previousShiftEnd = "17:00"
previousGuardId = "abc-123-def"
```

**Step 4: Execute Update**
```sql
UPDATE shifts 
SET shift_start = '10:00', shift_end = '18:00' 
WHERE id = 'shift-uuid'
RETURNING *
```

**Step 5: Detect Change**
```javascript
// notifyShiftChanges() compares:
currentShift.shift_start = "09:00"  →  updatedShift.shift_start = "10:00"  ✅ CHANGED
currentShift.shift_end = "17:00"     →  updatedShift.shift_end = "18:00"    ✅ CHANGED
currentShift.guard_id = "abc-123"    →  updatedShift.guard_id = "abc-123"  ✅ EXISTS

// Decision: Create SHIFT_TIME_CHANGED notification
```

**Step 6: Create Notification**
```javascript
createGuardNotification({
  guardId: "abc-123-def",
  type: "SHIFT_TIME_CHANGED",
  title: "Shift Time Updated",
  message: "Your shift on 2024-01-15 has been updated. New time: 10:00 to 18:00",
  shiftId: "shift-uuid",
  meta: {
    previousStart: "09:00",
    previousEnd: "17:00",
    newStart: "10:00",
    newEnd: "18:00"
  }
})
```

**Step 7: Store in Database**
```sql
INSERT INTO guard_notifications 
(guard_id, type, title, message, shift_id, meta, created_at)
VALUES 
('abc-123-def', 'SHIFT_TIME_CHANGED', 'Shift Time Updated', 
 'Your shift on 2024-01-15 has been updated...', 
 'shift-uuid', 
 '{"previousStart":"09:00","newStart":"10:00",...}',
 NOW())
```

**Step 8: Emit Real-time Event**
```javascript
// Socket.IO emits to guard's personal room
io.to("guard:abc-123-def").emit("guard:notification:new", {
  id: "notif-uuid",
  type: "SHIFT_TIME_CHANGED",
  title: "Shift Time Updated",
  message: "Your shift on 2024-01-15 has been updated...",
  // ... full notification object
})
```

**Step 9: Guard UI Receives (Two Ways)**

**A. Real-time (if guard is connected via Socket.IO)**
- Guard's browser receives socket event immediately
- Component can update UI instantly (future enhancement)

**B. Polling (Current Implementation)**
- Component fetches notifications every 30 seconds
- New notification appears in the list
- Unread count badge updates

**Step 10: Guard Sees Notification**
```
┌─────────────────────────────────────┐
│ Shift Alerts          [1]           │
├─────────────────────────────────────┤
│ 🕐 Shift Time Updated               │
│ Your shift on 2024-01-15 has been   │
│ updated. New time: 10:00 to 18:00   │
│ 2m ago                        [✓]    │
└─────────────────────────────────────┘
```

---

## 🎯 Notification Types & Triggers

| Notification Type | Trigger | Example |
|-----------------|----------|---------|
| `SHIFT_ASSIGNED` | Guard assigned to shift (was null, now has guard_id) | "You have been assigned a new shift..." |
| `SHIFT_UNASSIGNED` | Guard removed from shift (had guard_id, now null) | "You have been removed from the shift..." |
| `SHIFT_CANCELLED` | Shift status changed to CANCELLED OR shift deleted | "Your shift has been cancelled" |
| `SHIFT_TIME_CHANGED` | shift_start or shift_end changed | "Your shift time has been updated..." |
| `SHIFT_DATE_CHANGED` | shift_date changed | "Your shift has been moved from..." |
| `SHIFT_LOCATION_CHANGED` | location changed | "Your shift location has been changed..." |

---

## 🔄 Real-time vs Polling

### Current Implementation: Polling
- **Frequency**: Every 30 seconds
- **Method**: `GET /api/guard/notifications`
- **Pros**: Simple, works without Socket.IO connection
- **Cons**: Up to 30-second delay

### Future Enhancement: Real-time (Socket.IO)
- **Method**: Listen to `guard:notification:new` events
- **Pros**: Instant delivery (< 1 second)
- **Cons**: Requires Socket.IO connection

**Note**: The backend already emits socket events, but the frontend currently uses polling. To enable real-time, add a Socket.IO listener in the `ShiftNotifications` component.

---

## 🗄️ Database Schema

```sql
CREATE TABLE guard_notifications (
    id UUID PRIMARY KEY,
    guard_id UUID NOT NULL REFERENCES guards(id),
    type VARCHAR(50) NOT NULL,           -- SHIFT_ASSIGNED, etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    shift_id UUID REFERENCES shifts(id),
    read_at TIMESTAMP,                    -- NULL = unread
    meta JSONB DEFAULT '{}',              -- Additional data
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_guard_notifications_guard_id ON guard_notifications(guard_id);
CREATE INDEX idx_guard_notifications_read_at ON guard_notifications(read_at);
CREATE INDEX idx_guard_notifications_created_at ON guard_notifications(created_at DESC);
```

---

## 🔐 Security & Multi-tenancy

- **Tenant Isolation**: Notifications are filtered by `guard_id`, which is already tenant-scoped
- **Authentication**: All API endpoints require guard JWT token
- **Authorization**: Guards can only see their own notifications
- **Database**: Both backends share the same `abe_guard` database, ensuring consistency

---

## 🚀 Performance Considerations

1. **Indexes**: Database indexes on `guard_id`, `read_at`, and `created_at` ensure fast queries
2. **Batch Operations**: Multiple notifications can be created in a single transaction
3. **Non-blocking**: Notification creation failures don't break shift updates
4. **Polling Interval**: 30 seconds balances freshness with server load

---

## 📝 Key Files

### Backend
- `/admin-dashboard/backend/src/utils/guardNotification.js` - Change detection & notification creation
- `/admin-dashboard/backend/src/controllers/adminShifts.controller.js` - Shift CRUD operations
- `/abe-guard-ai/backend/src/controllers/guardNotifications.controller.js` - API endpoints
- `/abe-guard-ai/backend/src/models/GuardNotification.js` - Sequelize model

### Frontend
- `/guard-ui/guard-ui/src/components/ShiftNotifications.jsx` - Display component
- `/guard-ui/guard-ui/src/services/guardApi.js` - API functions

---

## ✅ Summary

The system works by:
1. **Detecting** changes when admins modify shifts
2. **Creating** notifications in the database
3. **Emitting** real-time events (ready for future use)
4. **Displaying** notifications in the guard UI
5. **Tracking** read/unread status

This ensures guards are always informed about schedule changes, reducing confusion and improving reliability! 🎯
