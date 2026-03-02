# Building the Admin Dashboard as a Mobile App (Capacitor)

The admin dashboard is set up as a **Capacitor** hybrid app so it can run on iOS and Android. The same React web app is wrapped in a native shell.

## Prerequisites

- **Android:** Android Studio and Android SDK (for building and running the Android app).
- **iOS:** macOS with Xcode and CocoaPods (for building and running the iOS app). If you see "CocoaPods is not installed" or "xcodebuild requires Xcode", install Xcode from the App Store and run `sudo gem install cocoapods`.

## One-time setup

Already done in this project:

- Capacitor is installed (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`).
- `capacitor.config.json` points the app to the `build` folder.
- iOS and Android platforms have been added (`ios/`, `android/`). On this machine, iOS may show a warning (CocoaPods/Xcode not installed); the iOS project is still created. On a Mac with Xcode and CocoaPods, run `npx cap sync` or `cd ios/App && pod install` to finish iOS.
- Backend CORS (port 5000) allows `capacitor://localhost` and `http://localhost` so the app can call your API from the device.

## Environment variables for mobile builds

When you build for production (so the app runs on a real device or emulator), the app must call your **deployed** backends, not localhost. Set these before `npm run build` (or in your CI/deploy):

| Variable | Purpose |
|---------|--------|
| `REACT_APP_API_URL` | Base URL for admin backend (e.g. `https://api.yourdomain.com`). |
| `REACT_APP_GUARD_AI_URL` | Base URL for abe-guard-ai backend (e.g. `https://guard-ai.yourdomain.com`). |
| `REACT_APP_GOOGLE_MAPS_API_KEY` | Optional; required only if you use the map page. |

Example (Unix/macOS):

```bash
export REACT_APP_API_URL=https://api.yourdomain.com
export REACT_APP_GUARD_AI_URL=https://guard-ai.yourdomain.com
npm run build
npx cap sync
```

Then open and run the native project (see below).

## Build and run

1. **Build the web app and sync to native projects:**

   ```bash
   npm run build:mobile
   ```

   Or step by step:

   ```bash
   npm run build
   npx cap sync
   ```

2. **Run on Android:**

   ```bash
   npm run cap:android
   ```

   This opens the project in Android Studio. From there, run on an emulator or connected device.

3. **Run on iOS (macOS with Xcode only):**

   ```bash
   npm run cap:ios
   ```

   This opens the project in Xcode. Select a simulator or device and run.

## Scripts reference

| Script | Command | Description |
|--------|---------|-------------|
| `build:mobile` | `react-scripts build && cap sync` | Production build then copy into `ios/` and `android/`. |
| `cap:sync` | `cap sync` | Copy `build/` into native projects and update native deps. |
| `cap:ios` | `cap open ios` | Open the iOS project in Xcode. |
| `cap:android` | `cap open android` | Open the Android project in Android Studio. |

## Testing with a local backend

To test the app against your machine’s backend (e.g. same Wi‑Fi):

1. Find your computer’s LAN IP (e.g. `192.168.1.10`).
2. Build with that as the API host:

   ```bash
   REACT_APP_API_URL=http://192.168.1.10:5000 REACT_APP_GUARD_AI_URL=http://192.168.1.10:4000 npm run build
   npx cap sync
   ```

3. Ensure your backend (and abe-guard-ai if used) allow CORS from `capacitor://localhost` and `http://localhost` (already added in this repo’s backend).
4. Run the app on a device/emulator; it will call your machine’s IP.

## Guard-ui (separate app)

The **guard** mobile app is a separate project (guard-ui). It is not in this repo. To build a Capacitor version of guard-ui, use that project’s codebase and point it at the same admin backend (port 5000) for `/api/guard/*` and `/api/guards/*`. See `CAPACITOR_HYBRID_REVIEW.md` in the repo root for the guard API surface and checklist.
