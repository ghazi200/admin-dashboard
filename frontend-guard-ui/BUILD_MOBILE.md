# Guard UI – Mobile build (Capacitor)

Guard UI is set up with Capacitor for **iOS** and **Android**. Use this when building or running the app on device/simulator.

---

## Prerequisites

- **Android:** Android Studio and SDK.
- **iOS:** Xcode (full app) and CocoaPods. See **Installing Xcode and CocoaPods** below.

---

## Installing Xcode and CocoaPods (macOS)

These must be installed on your Mac; they are not installed by this repo.

### 1. Xcode

- **Install:** Open the **Mac App Store**, search for **Xcode**, and install it (or download from [developer.apple.com](https://developer.apple.com/xcode/)).
- **One-time setup:** Open Xcode once, accept the license, and wait for any components to finish installing.
- **Point Command Line Tools at Xcode** (required for CocoaPods and `pod install`):

  ```bash
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  ```

  Check: `xcode-select -p` should print `/Applications/Xcode.app/Contents/Developer`.

### 2. CocoaPods

Choose one:

- **Option A – Homebrew** (if Homebrew is set up and writable):

  ```bash
  brew install cocoapods
  ```

  If you see “not writable” errors, fix ownership first:

  ```bash
  sudo chown -R $(whoami) /usr/local/Cellar /usr/local/Frameworks /usr/local/Homebrew /usr/local/bin /usr/local/etc /usr/local/include /usr/local/lib /usr/local/opt /usr/local/sbin /usr/local/share /usr/local/var/homebrew
  ```

  then run `brew install cocoapods` again.

- **Option B – Ruby gem:**

  ```bash
  sudo gem install cocoapods
  ```

Check: `pod --version` should print a version number.

### 3. After both are installed

From the repo root:

```bash
cd frontend-guard-ui/ios/App && pod install
cd ../.. && npm run cap:ios
```

Or use the helper script (from `frontend-guard-ui`): `./scripts/ios-pod-and-open.sh`.

---

## Env vars (step 3)

For production or device builds, set API URLs before building:

```bash
export REACT_APP_GUARD_API_URL=https://your-guard-api.com
export REACT_APP_ADMIN_API_URL=https://your-admin-api.com
```

See `.env.example`. For local device testing you can leave these unset (defaults: localhost:4000, localhost:5000; device must reach your machine or use a tunnel).

---

## Android: Test connection / login failing (CORS)

On Android, the WebView can block API calls due to CORS. The app uses **Capacitor native HTTP** for the login screen (Test connection, Test Admin, and login) so those calls bypass CORS.

- **Config:** `capacitor.config.json` has `plugins.CapacitorHttp.enabled: true`. Do not remove it.
- After changing `capacitor.config.json`, run a **full build and sync** so the native project picks up the config:
  ```bash
  npm run build:mobile
  ```
  Then run the app again from Android Studio.

---

## Phone app freezing / “App isn’t responding”

On a **physical phone** (or emulator), the app is built with API URLs. If it still uses **localhost**, the phone tries to reach itself, so API calls hang and the app can freeze or show “App isn’t responding”.

**Fix: build the app with your Mac’s IP** so the phone can reach your backends over WiFi.

1. **Get your Mac’s IP** (same WiFi as the phone):
   ```bash
   ipconfig getifaddr en0
   ```
   If that’s empty, try `en1` or check **System Settings → Network → Wi‑Fi → Details**. Example: `192.168.1.105`.

2. **Build and sync** (use your actual IP):
   ```bash
   cd frontend-guard-ui
   REACT_APP_GUARD_API_URL=http://192.168.1.105:4000 REACT_APP_ADMIN_API_URL=http://192.168.1.105:5000 npm run build:mobile
   ```

3. **Run on the phone again** from Android Studio (Run button). Keep the **Guard API (4000)** and **Admin API (5000)** running on your Mac, and ensure the phone is on the same WiFi.

**Emulator:** Use `10.0.2.2` instead of your IP (that’s the emulator’s way to reach the host Mac):
   ```bash
   REACT_APP_GUARD_API_URL=http://10.0.2.2:4000 REACT_APP_ADMIN_API_URL=http://10.0.2.2:5000 npm run build:mobile
   ```

---

## Build and run

### 1. Build the web app and sync to native projects

```bash
npm run build:mobile
```

This runs `CI=false react-scripts build && cap sync` (so lint warnings don’t fail the build) and copies the `build` output into `ios` and `android`.

### 2. Open in IDE and run

**iOS:**

```bash
npm run cap:ios
```

Then build and run in Xcode (simulator or device). If you see CocoaPods errors, open `ios/App` in Xcode and run **Pod install** (or `cd ios/App && pod install`).

**Android:**

```bash
npm run cap:android
```

Then build and run in Android Studio (emulator or device).

**Open the correct folder:** `frontend-guard-ui/android` (not the repo root).

---

## Android Studio: app won’t build or launch

### “Unable to locate a Java Runtime” / Gradle sync fails

macOS may have **no system JDK**. The project sets Gradle to Android Studio’s embedded JDK in `android/gradle.properties` (`org.gradle.java.home`).

Also in Android Studio: **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK** → choose **Embedded JDK** (or the same JBR path as in `gradle.properties`).

Terminal builds:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd frontend-guard-ui/android && ./gradlew assembleDebug
```

### SDK location

`android/local.properties` must point at a valid SDK (`sdk.dir=...`). Copy `android/local.properties.example` to `local.properties` and uncomment the path that exists on your machine. In Android Studio: **Settings → Languages & Frameworks → Android SDK** → note the SDK path and use it in `local.properties`.

### Before Run in Android Studio

1. Sync web assets: `cd frontend-guard-ui && npm run build:mobile`
2. **File → Sync Project with Gradle Files**
3. Choose a device/emulator, then **Run** (green play)

If the app installs but stays on a **black/splash screen**, rebuild with `npm run build:mobile` and run again (MainActivity uses the Android 12+ splash API so the WebView can show).

### Run succeeds in Studio but nothing installs / “Can’t find service: package”

The **emulator is often broken**, not the app. Gradle builds the APK, but `adb install` fails when the emulator’s package manager is down.

**Check from terminal:**

```bash
chmod +x frontend-guard-ui/scripts/android-run-check.sh
./frontend-guard-ui/scripts/android-run-check.sh
```

**Emulator won’t stop (Cold Boot greyed out):** force-quit it from Terminal:

```bash
./frontend-guard-ui/scripts/android-kill-emulator.sh
```

If it still won’t die, quit **Android Studio** completely, run the script again, then reopen Studio.

**Fix the emulator:**

1. Android Studio → **Device Manager**
2. On your virtual device → **⋮** → **Cold Boot Now**
3. If install still fails → **Wipe Data**, or delete the AVD and create a new **Pixel** image (API 34 recommended)
4. Wait until the home screen is fully up, then **Run** again

**Or use a physical phone:** enable USB debugging, connect, select the phone in the device dropdown, Run.

### Gradle / Android Studio version

This project uses **Gradle 8.2.1** and **Android Gradle Plugin 8.2.1** (Capacitor-friendly). Do not bump to Gradle 8.13 unless your Android Studio release explicitly supports it.

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build:mobile` | Build React app (CI=false) and `cap sync` |
| `npm run cap:sync` | Copy `build` into native projects only |
| `npm run cap:ios` | Open iOS project in Xcode |
| `npm run cap:android` | Open Android project in Android Studio |
| `./scripts/android-run-check.sh` | Diagnose JDK, SDK, emulator, and assembleDebug |

---

## CORS

For the app to call your backends from a device or simulator, the **guard API** (4000) and **admin API** (5000) must allow the app’s origin in CORS (e.g. `capacitor://localhost` or your production URL). Configure this on both backends when deploying.

---

## Complete the mobile build (checklist)

Use this after login and core flows work in the app.

### 1. Test core flows on device/emulator

- [ ] **Login** – Guard login; use "Reset URLs" if you changed location.
- [ ] **Messages** – See conversations, send/receive (Admin API URL must be set).
- [ ] **Shifts / Home** – View shifts and other guard features.
- [ ] **Shift swap / availability** – If used, confirm Admin API (5000) is reachable.

### 2. Build for the right environment

- **Emulator:** `npm run build:mobile` (app uses 10.0.2.2 on Android).
- **Physical phone (same Wi-Fi as Mac):**  
  `REACT_APP_GUARD_API_URL=http://YOUR_MAC_IP:4000 REACT_APP_ADMIN_API_URL=http://YOUR_MAC_IP:5000 npm run build:mobile`  
  Then run from Android Studio. On first open, set Server URL on Login if needed.
- **Production (later):** Set both env vars to your deployed API URLs, then `npm run build:mobile`.

### 3. (Optional) App icon and splash

- Android: replace icons in `android/app/src/main/res/mipmap-*`.
- iOS: replace in `ios/App/App/Assets.xcassets/`. Adjust splash in native projects if needed.

### 4. (Optional) Android release / Play Store

- Android Studio: **Build → Generate Signed Bundle / APK**; create or use a keystore.
- For Play Store: upload the AAB and complete store listing and policy steps.
