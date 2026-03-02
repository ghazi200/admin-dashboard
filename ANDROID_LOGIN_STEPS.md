# Android app login – exact steps

If web login works but **Android still won’t log in**, do these in order.

**No rebuild needed:** On the login screen there is a **Server URL** field. Set it to `http://YOUR_MAC_IP:4000` (e.g. `http://192.168.1.211:4000`), tap **Save URL**, then **Test connection**. If that shows OK, log in with email/password. Your Mac IP: System Settings → Network → Wi‑Fi → Details.

---

## Step 1: Start the Guard API (port 4000)

This is the **abe-guard-ai** backend, **not** the admin-dashboard backend.

**Open a terminal and run:**

```bash
cd ~/admin-dashboard/abe-guard-ai/backend
node src/server.js
```

Leave this running. You must see:

**`ABE Security real-time backend running on 4000 (0.0.0.0)`**

- If you run `node server.js` from **admin-dashboard/backend** instead, that is port **5000** and will **not** work for guard login.
- You need the server that lives in **abe-guard-ai/backend** (port **4000**).

---

## Step 2: Build the app with your Mac’s IP

**In a different terminal:**

```bash
cd ~/admin-dashboard/frontend-guard-ui
./scripts/build-for-phone.sh
```

If the script can’t find your IP, get it from **System Settings → Network → Wi‑Fi → Details** (e.g. `192.168.1.211`) and run:

```bash
REACT_APP_GUARD_API_URL=http://192.168.1.211:4000 REACT_APP_ADMIN_API_URL=http://192.168.1.211:5000 npm run build:mobile
```

(Use your real IP instead of `192.168.1.211`.)

---

## Step 3: Run the app on the phone

1. Open **Android Studio** and run the app (green Run button) so the **new** build is installed.
2. Make sure the **phone is on the same Wi‑Fi** as your Mac.

---

## Step 4: Check the login screen on the phone

- Under the title it should show **API: http://192.168.x.x:4000** (your Mac’s IP).
- If it still shows **API: http://localhost:4000**, the build did not use your IP. Redo Step 2, then Step 3.
- Tap **“Test connection”**. It should show **Connection OK**. If it shows **Connection failed**, the phone can’t reach your Mac (same Wi‑Fi? Guard API still running? Firewall?).

---

## Step 5: Log in

- Email: **bob@abe.com**
- Password: **password123**

---

**Summary:** Guard login on Android needs (1) **Guard API on 4000** from **abe-guard-ai/backend**, (2) app **built with your Mac’s IP**, (3) phone on **same Wi‑Fi**, (4) **re-run from Android Studio** after every such build.
