# Socket connection patterns – copy & paste

Use the **single shared gateway** via `connectSocket()` or `connectAdminSocket()` from `../realtime/socket`.  
Socket is optional: if it returns `null` (no token or no gateway URL), the page still works; realtime is just disabled.

---

## 1. Import (add at top of file)

```javascript
import { connectSocket } from "../realtime/socket";
```

For pages that need both “guard” and “admin” events (e.g. Dashboard), you can use:

```javascript
import { connectSocket, connectAdminSocket } from "../realtime/socket";
```

---

## 2. Reports page (ReportBuilder)

Add a `useEffect` that connects and refetches reports when relevant events fire. Clean up on unmount.

```javascript
// Add import
import { connectSocket } from "../realtime/socket";

// Inside ReportBuilder, add this useEffect (e.g. after other useEffects).
// Uses queryClient from useQueryClient().
useEffect(() => {
  const socket = connectSocket();
  if (!socket) return;

  const refetchReports = () => {
    queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
    queryClient.invalidateQueries({ queryKey: ["reportRuns"] });
    queryClient.invalidateQueries({ queryKey: ["scheduledReports"] });
  };

  socket.on("schedule_generated", refetchReports);
  socket.on("schedule_updated", refetchReports);
  // Optional: if backend emits report-specific events
  // socket.on("report:generated", refetchReports);

  return () => {
    socket.off("schedule_generated", refetchReports);
    socket.off("schedule_updated", refetchReports);
  };
}, [queryClient]);
```

---

## 3. Inspections page

Add a `useEffect` that connects and refetches inspection requests when new or updated inspections are broadcast.

```javascript
// Add import
import { connectSocket } from "../realtime/socket";

// Inside Inspections, add this useEffect (e.g. after your existing useEffects).
// Ensure loadRequests is in scope (your existing fetch function).
useEffect(() => {
  const socket = connectSocket();
  if (!socket) return;

  const onInspectionEvent = () => loadRequests();
  socket.on("inspection:request", onInspectionEvent);
  socket.on("inspection:submitted", onInspectionEvent);
  socket.on("inspection:request:created", onInspectionEvent);

  return () => {
    socket.off("inspection:request", onInspectionEvent);
    socket.off("inspection:submitted", onInspectionEvent);
    socket.off("inspection:request:created", onInspectionEvent);
  };
}, []);
```

---

## 4. Incidents page (already implemented – reference)

```javascript
import { connectSocket } from "../realtime/socket";

useEffect(() => {
  loadSites();
  loadIncidents();

  const socket = connectSocket();
  if (socket) {
    const handleNewIncident = () => loadIncidents();
    const handleUpdatedIncident = () => loadIncidents();
    socket.on("incidents:new", handleNewIncident);
    socket.on("incidents:updated", handleUpdatedIncident);
    return () => {
      socket.off("incidents:new", handleNewIncident);
      socket.off("incidents:updated", handleUpdatedIncident);
    };
  }
}, []);
```

---

## 5. Command Center

```javascript
import { connectSocket } from "../realtime/socket";

useEffect(() => {
  const socket = connectSocket();
  if (!socket) return;

  const handleNewEvent = () => {
    // Refetch or update local state as needed
    queryClient.invalidateQueries({ queryKey: ["yourQueryKey"] });
  };
  socket.on("incidents:new", handleNewEvent);
  socket.on("incidents:updated", handleNewEvent);
  socket.on("callout_started", handleNewEvent);
  socket.on("guard_clocked_in", handleNewEvent);
  socket.on("guard_clocked_out", handleNewEvent);

  return () => {
    socket.off("incidents:new", handleNewEvent);
    socket.off("incidents:updated", handleNewEvent);
    socket.off("callout_started", handleNewEvent);
    socket.off("guard_clocked_in", handleNewEvent);
    socket.off("guard_clocked_out", handleNewEvent);
  };
}, [queryClient]);
```

---

## 6. Analytics

```javascript
import { connectSocket } from "../realtime/socket";

useEffect(() => {
  const socket = connectSocket();
  if (!socket) return;

  const refreshAnalytics = () => {
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  };
  socket.on("callout:created", refreshAnalytics);
  socket.on("callout:filled", refreshAnalytics);
  socket.on("shift:created", refreshAnalytics);
  socket.on("shift:filled", refreshAnalytics);
  socket.on("shift:closed", refreshAnalytics);
  socket.on("guard:availability_changed", refreshAnalytics);

  return () => {
    socket.off("callout:created", refreshAnalytics);
    socket.off("callout:filled", refreshAnalytics);
    socket.off("shift:created", refreshAnalytics);
    socket.off("shift:filled", refreshAnalytics);
    socket.off("shift:closed", refreshAnalytics);
    socket.off("guard:availability_changed", refreshAnalytics);
  };
}, [queryClient]);
```

---

## 7. Super Admin Dashboard

```javascript
import { connectSocket } from "../realtime/socket";

useEffect(() => {
  const socket = connectSocket();
  if (!socket) return;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["superAdminData"] });
  };
  const attachListeners = () => {
    socket.on("shift_created", refreshAll);
    socket.on("shift_updated", refreshAll);
    socket.on("callout_started", refreshAll);
    socket.on("guard_clocked_in", refreshAll);
    socket.on("guard_clocked_out", refreshAll);
    socket.on("incidents:new", refreshAll);
    socket.on("incidents:updated", refreshAll);
  };
  attachListeners();
  socket.on("connect", attachListeners);
  socket.on("reconnect", attachListeners);

  return () => {
    socket.off("shift_created", refreshAll);
    socket.off("shift_updated", refreshAll);
    socket.off("callout_started", refreshAll);
    socket.off("guard_clocked_in", refreshAll);
    socket.off("guard_clocked_out", refreshAll);
    socket.off("incidents:new", refreshAll);
    socket.off("incidents:updated", refreshAll);
    socket.off("connect", attachListeners);
    socket.off("reconnect", attachListeners);
  };
}, [queryClient]);
```

---

## 8. Schedule page

```javascript
import { connectSocket } from "../realtime/socket";

useEffect(() => {
  const s = connectSocket();
  if (!s) return;

  const refetch = () => queryClient.invalidateQueries({ queryKey: ["schedule"] });
  s.on("schedule_updated", refetch);
  s.on("shift_created", refetch);
  s.on("shift_updated", refetch);
  s.on("shift_filled", refetch);

  return () => {
    s.off("schedule_updated", refetch);
    s.off("shift_created", refetch);
    s.off("shift_updated", refetch);
    s.off("shift_filled", refetch);
  };
}, [queryClient]);
```

---

## 9. Global notifications (NotificationContext – already implemented)

Notifications use the same socket; listeners are in `NotificationContext.jsx` for `notification:new`.  
Reports and Inspections do not need to subscribe to notifications themselves; the bell icon gets updates app-wide.

---

## 10. Dashboard (connect + admin socket)

Dashboard uses both `connectSocket()` and `connectAdminSocket()` (same underlying connection) and attaches many listeners (callout_started, shift_filled, guard_clocked_in/out, etc.). See `src/pages/Dashboard.jsx` for the full pattern.

---

## Rules of thumb

- **Always** guard: `const socket = connectSocket(); if (!socket) return;`
- **Always** clean up in the effect return: `socket.off("event", handler)` for every `socket.on("event", handler)`.
- Use **one shared** `connectSocket()` / `connectAdminSocket()` per app; the module keeps a singleton.
- Reports and Inspections work without socket; adding these blocks is optional for live updates.
