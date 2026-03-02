# Fix: "Waiting for all targeting devices to come online" (then timeout)

The emulator must be **already booted and online** before you click Run. Android Studio often fails to start it for you in time.

---

## Do this every time (recommended)

### 1. Reset ADB (in Terminal on your Mac)

```bash
adb kill-server
adb start-server
```

### 2. Start the emulator yourself (do NOT use Run yet)

- In **Android Studio**: **Tools → Device Manager** (or the phone icon in the toolbar).
- Click the **▶ Play** button next to your virtual device to **start the emulator**.
- Wait until the **Android home screen** is fully visible (can take 1–3 minutes on first boot).
- Optional check in Terminal: `adb devices` — you should see something like `emulator-5554   device`.

### 3. Then run the app

- In Android Studio, click the green **Run** button.
- The device should already be "online", so it deploys without waiting.

---

## If the emulator never comes online

### A. Cold boot (clears bad snapshot)

- **Device Manager** → **▼** next to your device → **Cold Boot Now**.
- Wait for the home screen, then **Run**.

### B. Wipe data

- **Device Manager** → **▼** next to your device → **Wipe Data**.
- Start the device again (▶), wait for home screen, then **Run**.

### C. Use a new, lighter AVD

- **Device Manager** → **Create Device**.
- Pick **Pixel 6** (or similar).
- System image: **API 33** or **API 34** (download if needed) — avoid very old (e.g. API 28) or bleeding‑edge.
- Finish, then start this new device and wait for home screen before **Run**.

### D. Kill stuck emulator processes (Mac)

If the emulator window is stuck or blank:

```bash
pkill -9 -f qemu-system
pkill -9 -f emulator
adb kill-server
adb start-server
```

Then in Android Studio start the emulator again from Device Manager.

---

## Summary

**Start the emulator first from Device Manager → wait for home screen → then Run.** Do not rely on "Run" to start the emulator; that often causes "waiting for devices to come online" and timeout.
