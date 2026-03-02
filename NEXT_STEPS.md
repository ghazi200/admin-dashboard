# What’s Next to Complete the Task

Everything is in one repo and `start-all.sh` runs all four services. Here’s what’s left to **fully complete** the setup.

---

## Done

- abe-guard-ai, backend, frontend-guard-ui, frontend-admin-dashboard all in this repo  
- `start-all.sh` uses repo paths only  
- `README_MONOREPO.md` explains structure and how to run everything  
- **Token compatibility (step 2):** Verified with `bob@abe.com` — one token works for both 4000 and 5000.

---

## Next steps (in order)

### 1. First-time install and smoke test — DONE

- **Installed:** `abe-guard-ai/backend` and `frontend-guard-ui` dependencies.
- **Run:** `./start-all.sh` and confirm Guard UI (3000) and Admin dashboard (3001) load.
- **Token test (step 2):** Run when both backends (4000 and 5000) are up:
  ```bash
  GUARD_EMAIL=<guard-email-in-abe-guard-ai> GUARD_PASSWORD=<password> node test-token-compatibility.js
  ```
  - **200** = token compatible (one token works for both).
  - **401** from 5000 = not compatible (fix per step 2 below).
  - **401** from 4000 = use a real guard account from abe-guard-ai’s `guards` table.

---

### 2. Token compatibility (4000 vs 5000) — DONE

- Test run with `bob@abe.com` / `password123`: **token from 4000 accepted by 5000** (200 on `/api/guard/messages/conversations`). No change needed.

---

### 3. Env vars for production (frontend-guard-ui) — DONE

- **Added:** `frontend-guard-ui/src/config/apiUrls.js` with `getGuardApiUrl()` and `getAdminApiUrl()` (defaults: localhost:4000, localhost:5000).
- **Updated:** `axiosClients.js` (guardClient + messagesClient), `shiftManagement.api.js`, `Payroll.jsx` (all three pay-stub links), and `setupProxy.js` to use env.
- **Added:** `frontend-guard-ui/.env.example` with `REACT_APP_GUARD_API_URL` and `REACT_APP_ADMIN_API_URL`.
- For production: set those env vars at build time (e.g. `REACT_APP_GUARD_API_URL=https://guard-api.example.com npm run build`).

---

### 4. Capacitor for guard app (mobile) — If you want iOS/Android

- **Do:**
  - In `frontend-guard-ui`: add Capacitor (`@capacitor/core`, `cli`, `ios`, `android`), `cap init`, `webDir: "build"`, add ios + android.
  - Add scripts: `build:mobile`, `cap:sync`, `cap:open:ios`, `cap:open:android`.
  - Build with production API URLs, then `cap sync`; ensure both backends allow CORS for the app’s origin(s).

Details: `GUARD_UI_COMPLETION_TASKS.md` § 3.

---

### 5. Guard-ui README / BUILD_MOBILE — Medium

- Add a short README or `BUILD_MOBILE.md` in `frontend-guard-ui` with:
  - Env vars (step 3).
  - Dev: start 4000 + 5000, proxy `/api/guard` → 5000.
  - Mobile: build with prod URLs, `cap sync`, open Xcode/Android Studio (if you did step 4).

---

## Summary

| # | Task | When |
|---|------|------|
| 1 | Install deps + run `./start-all.sh` and smoke test | Done |
| 2 | Token compatibility (4000 vs 5000) | Done (verified with bob@abe.com) |
| 3 | Add REACT_APP_GUARD_API_URL + REACT_APP_ADMIN_API_URL in guard-ui | Done |
| 4 | Add Capacitor to frontend-guard-ui | Done |
| 5 | Guard-ui README / BUILD_MOBILE.md | When doing 3 or 4 |

**Next:** **Step 5** (guard-ui README) is optional. For iOS: install Xcode + CocoaPods and run `pod install` in `frontend-guard-ui/ios/App` if needed.
