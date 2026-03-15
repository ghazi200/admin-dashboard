# Socket files review

## package.json
- **Fine.** `socket.io-client` ^4.7.0, Node 24.x. `proxy` is dev-only (not used in production build).

---

## socket.js (ACTIVE — used everywhere)
- **Production URL:** Correct. When host is not localhost, always uses Railway gateway; never uses env so no localhost in production.
- **Transport:** `transports: ["websocket"]`, `upgrade: false` — matches websocket-only gateway.
- **Reconnection:** 3s–15s delays, token refresh on reconnect_attempt.
- **Build ID:** `SOCKET_BUILD_ID` lets you confirm new deploy in console.
- **Used by:** NotificationContext, Dashboard, Login, Schedule, Incidents, Analytics, CommandCenter, SuperAdminDashboard, Layout/Navbar (disconnect), useSessionTimeout.

---

## socketManager.js (NOT USED — dead code)
- **No imports:** Nothing in the app imports `socketManager`. All code uses `socket.js`.
- **Risk:** If someone later imports it, they’d get a **second** socket with different options:
  - `transports: ["websocket", "polling"]` (gateway is websocket-only; polling would fail).
  - Different reconnection limits and no build-id log.
- **Recommendation:** Either remove it or align it with socket.js and add a comment that socket.js is the single source of truth. Aligning it avoids future bugs if it’s ever used.
