# Guard-UI: Full File Review & Function List

This document reviews **all** guard-ui related files: (1) **reference components** inside the admin-dashboard repo, and (2) the **standalone guard-ui app** (separate project, e.g. `guard-ui/guard-ui`), which includes **callout, clock in/out, and running late**.

---

## Two “guard-ui” contexts

| Context | Location | Callout / Clock in-out / Running late? |
|--------|----------|----------------------------------------|
| **Reference components** | `frontend-admin-dashboard/.../src/components/guard-ui/` | **No.** Messages, availability, shift swap only. |
| **Standalone guard app** | Separate project, e.g. `guard-ui/guard-ui` (port 3000, backend abe-guard-ai port 4000) | **Yes.** Callout, clock in/out, break, running late, respond to callout offers. |

The **standalone guard-ui** is the full guard-facing app; the admin-dashboard only embeds a **test view** of messaging at `/messages/guard`.

---

## Standalone guard-ui app (callout, clock in/out, running late)

The **standalone guard-ui** lives in a separate project (e.g. `guard-ui/guard-ui`). It talks to **abe-guard-ai backend (port 4000)** for auth, shifts, clock, callouts, and running late. Messaging can proxy to admin-dashboard backend (5000) for `/api/guard/messages`.

### Routes (standalone guard-ui)

| Route | Page | Main features |
|-------|------|----------------|
| `/login` | Login | Guard login (guardClient → 4000) |
| `/` | Home | Dashboard |
| `/timeclock` | **TimeClock** | **Clock In** (with geolocation + device info), **Clock Out**, **Lunch Break Start**, **Lunch Break End** |
| `/callouts` | **Callouts** | **Call Out** (trigger callout), **Running Late** (dropdown: minutes + reason), **Respond to callout offers** (Accept/Decline) |
| `/shifts` | Shifts | List shifts |
| `/shifts/swap` | ShiftSwapMarketplace | Browse/post shift swaps |
| `/shifts/availability` | AvailabilityPreferences | Preferred days/times, blocked dates, hours |
| `/shifts/history` | ShiftHistory | Shift history + overtime |
| `/shifts/:id/report` | ShiftReportForm | Shift report |
| `/schedule` | Schedule | Schedule view |
| `/messages` | Messages | In-app messaging (admin ↔ guard) |
| `/account` | Account | Account settings |
| `/incident*` | IncidentReport / IncidentReportSimple | Incident reporting |
| `/ask-policy` | AskPolicy | Policy Q&A |

### Callout, clock in/out, running late (standalone guard-ui)

| Feature | Where | API (guardApi.js) | Backend |
|--------|--------|-------------------|--------|
| **Call out** | Callouts.jsx — “Call Out” button | `triggerCallout({ shiftId })` | POST `/callouts/trigger` (4000) |
| **Running late** | Callouts.jsx + RunningLateDropdown.jsx — “Running Late” → minutes + reason | `runningLate({ shiftId, minutesLate, reason })` | POST `/shifts/:id/running-late` (4000) |
| **Respond to callout** (accept/decline offer) | Callouts.jsx — Accept / Decline on ranked candidates | `respondToCallout(calloutId, "ACCEPTED" \| "DECLINED")` | POST `/callouts/:id/respond` (4000) |
| **Clock in** | TimeClock.jsx — “Clock In” (optional geolocation + deviceId/deviceType/deviceOS) | `clockIn(shiftId, locationData)` | POST `/shifts/:id/clock-in` (4000) |
| **Clock out** | TimeClock.jsx — “Clock Out” | `clockOut(shiftId)` | POST `/shifts/:id/clock-out` (4000) |
| **Lunch break start/end** | TimeClock.jsx — “Lunch Break Start” / “Lunch Break End” | `breakStart(shiftId)`, `breakEnd(shiftId)` | POST `/shifts/:id/break-start`, `break-end` (4000) |

### Key files (standalone guard-ui)

| File | Purpose |
|------|--------|
| `guard-ui/src/pages/Callouts.jsx` | Call out, running late (uses RunningLateDropdown), respond to callout offers; loads current shift via `listShifts` + `pickCurrentShift`. |
| `guard-ui/src/pages/TimeClock.jsx` | Clock in (with geolocation/device), clock out, break start/end; shift ID input. |
| `guard-ui/src/components/RunningLateDropdown.jsx` | Minutes late (5–60), reason field; calls `onSubmit({ minutesLate, reason })`. |
| `guard-ui/src/services/guardApi.js` | All guard API functions; `guardClient` baseURL `http://localhost:4000`. |
| `guard-ui/src/api/axiosClients.js` | `guardClient` (4000), `messagesClient` (proxy to 5000 for /api/guard). |

So **callout, clock in/out, and running late are implemented in the standalone guard-ui frontend** and are backed by the **abe-guard-ai** backend (4000), not the admin-dashboard backend (5000).

---

## 1. File inventory (admin-dashboard reference components)

| File | Purpose |
|------|--------|
| `frontend-admin-dashboard/admin-dashboard-frontend/src/components/guard-ui/GuardMessages.jsx` | Guard messaging UI: conversations list, message thread, send/delete, polling |
| `frontend-admin-dashboard/admin-dashboard-frontend/src/components/guard-ui/guardMessaging.service.js` | API client for `/api/guard/messages/*` (conversations, messages, send, delete, mark read) |
| `frontend-admin-dashboard/admin-dashboard-frontend/src/components/guard-ui/AvailabilityPreferences.jsx` | UI for guard availability preferences (days, times, blocked dates, hours) |
| `frontend-admin-dashboard/admin-dashboard-frontend/src/components/guard-ui/ShiftSwapMarketplace.jsx` | UI for browsing shift swaps and posting own shift for swap |
| `frontend-admin-dashboard/admin-dashboard-frontend/src/components/guard-ui/README_MESSAGES.md` | Docs for using Guard Messages in a standalone guard-ui app |
| `frontend-admin-dashboard/admin-dashboard-frontend/src/pages/MessagesGuard.jsx` | Admin page that renders guard messaging “as guard” (token picker + `<GuardMessages />`) |

**Note:** `AvailabilityPreferences` and `ShiftSwapMarketplace` are **not** mounted on any route in this app; they are reusable guard-ui components intended for a standalone guard app. Only **GuardMessages** is used in-app at `/messages/guard` via **MessagesGuard.jsx**.

---

## 2. Per-file functions and capabilities

### 2.1 `guardMessaging.service.js`

**Purpose:** Axios client for guard in-app messaging. Base URL: `REACT_APP_API_URL` or `http://localhost:5000`, path `/api/guard/messages`. Sends `Authorization: Bearer <guardToken>` from `localStorage`.

| Function | Description |
|----------|-------------|
| `getBaseURL()` | Resolves API base URL from env or localhost default (internal) |
| `listConversations(params)` | GET `/conversations` – list conversations for the guard |
| `getConversation(conversationId)` | GET `/conversations/:id` – get one conversation |
| `getMessages(conversationId, params)` | GET `/conversations/:id/messages` – get messages (e.g. page, limit) |
| `sendMessage(conversationId, body)` | POST `/conversations/:id/messages` – send a message (e.g. `{ content, messageType: "text" }`) |
| `deleteMessage(conversationId, messageId)` | DELETE `/conversations/:id/messages/:messageId` – delete a message |
| `markConversationAsRead(conversationId, body)` | POST `/conversations/:id/read` – mark conversation as read |
| `deleteConversation(conversationId)` | DELETE `/conversations/:id` – leave/delete conversation for the guard |

---

### 2.2 `GuardMessages.jsx`

**Purpose:** Full guard messaging UI: sidebar of conversations, message thread, send box, delete on each message, 3s polling. Uses `guardMessaging.service.js` and `guardToken` from localStorage.

**Helpers (internal):**

| Name | Description |
|------|-------------|
| `formatTime(dateStr)` | Format timestamp for display (time only if today, else short date + time) |
| `normalizeMessage(m, index)` | Normalize API message to `{ id, content, sender_type, created_at, createdAt }` |
| `isOwnMessage(msg)` | Returns true if `msg.sender_type === "guard"` |

**Component state:** `conversations`, `selectedId`, `messages`, `input`, `loading`, `messagesLoading`, `sending`, `error`, `deletingMessageId`, `deletingConversationId`, `messagesEndRef`.

**Callbacks / effects:**

| Name | Description |
|------|-------------|
| `fetchMessagesForConversation(convId, setErrorOnFail, markRead, showLoading)` | Load messages for a conversation; optionally mark as read; used for initial load and polling |
| `loadConversations()` | Fetch conversation list and set first as selected if none |
| `handleSend()` | Send current input (optimistic update, then replace with server message or remove on error) |
| `handleDeleteMessage(msg)` | Delete one message (own = soft-delete for everyone; admin msg = hide for this guard) |
| `handleDeleteConversation(conv, e)` | Leave conversation (confirm dialog, then remove from list and clear selection if needed) |

**User-facing behavior:**

- List conversations in sidebar; select one to view messages.
- Poll messages every **3 seconds** for the selected conversation.
- Send text messages; show optimistic message until server responds.
- **Delete** button on every message (own and others); delete conversation (Leave) on each conversation row.
- Auto-scroll to bottom when messages change.
- Empty state: “No conversations yet. An admin will add you to a group.” / “Select a conversation” / “No messages yet.”

**Exports:** Default export `GuardMessages` (no props).

---

### 2.3 `AvailabilityPreferences.jsx`

**Purpose:** Form for guards to set availability preferences. Uses `../../services/api`: `getAvailabilityPreferences(guardId)`, `updateAvailabilityPreferences({ ...data, guard_id })`. Uses React Query.

**Props:** `guardId` (required).

**Internal helpers:**

| Name | Description |
|------|-------------|
| `toggleArrayItem(array, item)` | Add or remove `item` from `array` |

**Handlers:**

| Name | Description |
|------|-------------|
| `handleDayToggle(day)` | Toggle day in `form.preferred_days` (monday … sunday) |
| `handleTimeToggle(time)` | Toggle time in `form.preferred_times` (morning, afternoon, evening, night) |
| `handleBlockDate(e)` | Add selected date to `form.blocked_dates` |
| `removeBlockedDate(date)` | Remove date from `form.blocked_dates` |
| `handleSubmit(e)` | Submit form via `updateMutation.mutate(form)` |

**Form fields:** Preferred days, preferred times, min/max hours per week, blocked dates (with add/remove).

**User-facing behavior:** Load current preferences by `guardId`, edit, Save Preferences (with success/error alert). Loading state: “Loading preferences...”.

**Exports:** Default export `AvailabilityPreferences({ guardId })`.

---

### 2.4 `ShiftSwapMarketplace.jsx`

**Purpose:** Guards browse available shift swaps and post their own shift for swap. Uses `../../services/api`: `getAvailableSwaps(guardId)`, `requestShiftSwap({ ...data, guard_id })`, `acceptShiftSwap(swapId, guardId)`. Uses React Query and mutations.

**Props:** `guardId` (required).

**State:** `activeTab`: `"browse"` | `"post"`.

**Internal:**

| Name | Description |
|------|-------------|
| `formatDate(dateStr)` | Format date for display or “—” if empty |
| `handleRequestSwap(e)` | Form submit: read shift_id, target_guard_id, reason; call `requestMutation.mutate(...)` |

**User-facing behavior:**

- **Browse tab:** List available swaps (date, time range, location, status, optional reason). “Accept Swap” for open swaps (with confirm). Empty: “No available swaps at the moment.”
- **Post tab:** Form to post own shift: Shift ID (required), Reason (optional). Submit “Post Shift for Swap” (success/error alert).

**Exports:** Default export `ShiftSwapMarketplace({ guardId })`.

---

### 2.5 `MessagesGuard.jsx`

**Purpose:** Admin “view as guard” page. If no `guardToken` in localStorage: show guard dropdown + “Set token & view” (uses `listGuards`, `getGuardViewToken` from `../services/api`). If token present: render `<GuardMessages />`.

**State:** `hasToken`, `guards`, `selectedGuardId`, `loading`, `tokenError`, `settingToken`.

**Functions:**

| Name | Description |
|------|-------------|
| `handleSetToken()` | Call `getGuardViewToken(selectedGuardId)`, store token in `localStorage` under `guardToken`, set `hasToken` true |

**User-facing behavior:** Token gate; then guard messaging UI. Link back to Admin Messages; short note that admin must add guard to a group to see messages.

**Route:** `/messages/guard` (in `App.js`).

---

### 2.6 `README_MESSAGES.md`

**Purpose:** Documentation only. Describes Guard Messages (guardMessaging.service.js + GuardMessages.jsx), polling, delete behavior, auth, and how to copy into a standalone guard-ui app. No code exports.

---

## 3. API used by guard-ui (from `services/api.js`)

These are used by guard-ui components or by the MessagesGuard page:

| API function | Used by | Purpose |
|--------------|--------|--------|
| `listGuards()` | MessagesGuard.jsx | Populate guard dropdown for “view as guard” |
| `getGuardViewToken(guardId)` | MessagesGuard.jsx | Get JWT to act as guard for messaging |
| `getAvailabilityPreferences(guardId)` | AvailabilityPreferences.jsx | Load guard availability preferences |
| `updateAvailabilityPreferences(data)` | AvailabilityPreferences.jsx | Save preferences (data includes `guard_id`) |
| `getAvailableSwaps(guardId)` | ShiftSwapMarketplace.jsx | List swaps available to guard |
| `requestShiftSwap(data)` | ShiftSwapMarketplace.jsx | Post shift for swap (shift_id, target_guard_id, reason, guard_id) |
| `acceptShiftSwap(swapId, guardId)` | ShiftSwapMarketplace.jsx | Accept a swap |

Messaging is **not** in `api.js`; it uses `guardMessaging.service.js` and `/api/guard/messages/*` on the backend.

---

## 4. Consolidated list: all guard-ui functions

### 4.1 User-facing (what a guard can do in the UI)

| Area | Function | Where |
|------|----------|--------|
| **Messaging** | View list of conversations | GuardMessages |
| | Select a conversation and view messages | GuardMessages |
| | Send a text message | GuardMessages |
| | Delete a message (own or hide admin message) | GuardMessages |
| | Leave/delete a conversation | GuardMessages |
| **Availability** | View current availability preferences | AvailabilityPreferences |
| | Set preferred days (Mon–Sun) | AvailabilityPreferences |
| | Set preferred times (morning, afternoon, evening, night) | AvailabilityPreferences |
| | Set min/max hours per week | AvailabilityPreferences |
| | Add/remove blocked dates | AvailabilityPreferences |
| | Save preferences | AvailabilityPreferences |
| **Shift swap** | Browse available shift swaps | ShiftSwapMarketplace |
| | Accept an open shift swap | ShiftSwapMarketplace |
| | Post own shift for swap (shift ID + optional reason) | ShiftSwapMarketplace |

### 4.2 Programmatic / API (exported or used)

| Function | File | Description |
|----------|------|-------------|
| `getBaseURL` | guardMessaging.service.js | Internal: resolve API base URL |
| `listConversations` | guardMessaging.service.js | GET conversations |
| `getConversation` | guardMessaging.service.js | GET one conversation |
| `getMessages` | guardMessaging.service.js | GET messages for conversation |
| `sendMessage` | guardMessaging.service.js | POST message |
| `deleteMessage` | guardMessaging.service.js | DELETE message |
| `markConversationAsRead` | guardMessaging.service.js | POST mark read |
| `deleteConversation` | guardMessaging.service.js | DELETE/leave conversation |
| `formatTime` | GuardMessages.jsx | Format message timestamp |
| `normalizeMessage` | GuardMessages.jsx | Normalize message object |
| `isOwnMessage` | GuardMessages.jsx | Check if sender is guard |
| `fetchMessagesForConversation` | GuardMessages.jsx | Load/poll messages |
| `loadConversations` | GuardMessages.jsx | Load conversation list |
| `handleSend` | GuardMessages.jsx | Send message with optimistic update |
| `handleDeleteMessage` | GuardMessages.jsx | Delete one message |
| `handleDeleteConversation` | GuardMessages.jsx | Leave conversation |
| `toggleArrayItem` | AvailabilityPreferences.jsx | Toggle item in array |
| `handleDayToggle` / `handleTimeToggle` | AvailabilityPreferences.jsx | Toggle day/time in form |
| `handleBlockDate` / `removeBlockedDate` | AvailabilityPreferences.jsx | Manage blocked dates |
| `handleSubmit` | AvailabilityPreferences.jsx | Save availability preferences |
| `formatDate` | ShiftSwapMarketplace.jsx | Format date for display |
| `handleRequestSwap` | ShiftSwapMarketplace.jsx | Submit “post shift for swap” form |
| `handleSetToken` | MessagesGuard.jsx | Set guardToken and show GuardMessages |

---

## 5. What is not in the admin-dashboard guard-ui components (this repo)

- **Guard login:** Not in admin frontend; backend has `guardAuth.routes.js` (e.g. login). The **standalone guard-ui** app has login and stores `guardToken`.
- **Callout / clock in-out / running late:** Not in the **admin-dashboard** repo’s guard-ui components. They **are** in the **standalone guard-ui** app (see section “Standalone guard-ui app” above).
- **Routes for AvailabilityPreferences / ShiftSwapMarketplace:** In admin-dashboard these components exist but are not mounted; the standalone guard-ui app mounts them at `/shifts/availability` and `/shifts/swap`.

---

## 6. Summary

| Item | Count |
|------|--------|
| Guard-ui **source files** (components + service + page + README) | 6 |
| **Exported API functions** (guardMessaging.service.js) | 8 |
| **React components** with props | 3 (GuardMessages no props; AvailabilityPreferences, ShiftSwapMarketplace take `guardId`) |
| **Page** that uses guard-ui | 1 (MessagesGuard at `/messages/guard`) |
| **User-facing capabilities** | Messaging (5), Availability (6), Shift swap (3) |

All functions listed above are covered in sections 2–4. For callout and clock in/out, see `GUARD_UI_COMPLETION_REVIEW.md`.
