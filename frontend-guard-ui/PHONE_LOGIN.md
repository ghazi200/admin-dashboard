# Log in on the phone app

Web login works; phone login needs the app to call your **Mac’s IP** (not localhost).

## 1. Same Wi‑Fi

- Phone and Mac must be on the **same Wi‑Fi network**.

## 2. Guard API (port 4000) must be running on your Mac

**This is the abe-guard-ai backend, not the admin-dashboard backend.** In a terminal:

```bash
cd ~/admin-dashboard/abe-guard-ai/backend
node src/server.js
```

Or: `npm start` (from that same folder).

Leave it running. You should see: **`🛡️ ABE Security real-time backend running on 4000 (0.0.0.0)`**.

If you only run `node server.js` from the **admin-dashboard/backend** folder, that is port **5000** — that is not enough for guard login. You need the one in **abe-guard-ai/backend** on **4000**.

## 3. Build the app with your Mac’s IP

From the repo (run on your Mac):

```bash
cd ~/admin-dashboard/frontend-guard-ui
./scripts/build-for-phone.sh
```

If the script says it can’t find your IP, use your Mac’s IP from **System Settings → Network → Wi‑Fi → Details** (e.g. `192.168.1.105`) and run:

```bash
REACT_APP_GUARD_API_URL=http://192.168.1.105:4000 REACT_APP_ADMIN_API_URL=http://192.168.1.105:5000 npm run build:mobile
```

(Replace `192.168.1.105` with your actual IP.)

## 4. Install and run on the phone

- In **Android Studio**, click the green **Run** button so the new build is installed on the phone.

## 5. Check on the phone

- Open the app and go to the **login** screen.
- Under the title you should see **API: http://192.168.x.x:4000** (your Mac’s IP).  
  If you see **API: http://localhost:4000**, the build did not use your IP — repeat step 3 and run again from Android Studio.
- Tap **“Test connection”**. It should show **✓ Connection OK**. If it shows **✗ Connection failed**:
  - Confirm phone and Mac are on the same Wi‑Fi.
  - Confirm the backend is running (step 2).
  - On Mac, try temporarily turning off **System Settings → Network → Firewall** (or allow Node/incoming on port 4000).

## 6. Log in on the phone

- Email: **bob@abe.com**
- Password: **password123**

If it still fails, the **API:** line and **Test connection** result tell you whether the problem is “wrong URL” or “can’t reach Mac”.
