const STORAGE_GUARD_API = "guardApiUrl";
const STORAGE_ADMIN_API = "adminApiUrl";

/** Emulator → host machine. Unified `server.js` listens on PORT (default 5000); use 5000 for both. */
const EMULATOR_GUARD_URL = "http://10.0.2.2:5000";
const EMULATOR_ADMIN_URL = "http://10.0.2.2:5000";

/** Single Railway (or cloud) backend — guard + admin on same host. */
const DEFAULT_CLOUD_BACKEND =
  (typeof process !== "undefined" && process.env?.REACT_APP_DEFAULT_BACKEND_URL) ||
  "https://admin-dashboard-production-2596.up.railway.app";

/**
 * Trim junk, strip path/query, remove trailing slash — API base should be origin only.
 * If the string has no scheme, assume https (Railway).
 */
function normalizeBackendBaseUrl(raw) {
  const trimmed = String(raw || "")
    .trim()
    .replace(/\u200B/g, "")
    .replace(/[\u00A0\t\n\r]+/g, "");
  if (!trimmed) return "";
  const withProto = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return trimmed.replace(/\/+$/, "");
    const hostport = u.hostname + (u.port ? `:${u.port}` : "");
    return `${u.protocol}//${hostport}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/** Android emulator user agents — include API 34+ / arm64 variants (sdk_gphone64, ranchu, etc.). */
function isProbablyAndroidEmulator() {
  try {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    return /sdk_gphone|sdk_google|generic_x86|generic_x86_64|emulator|Android SDK built for x86|ranchu|goldfish|qemu|gphone64|gphone_arm/i.test(
      ua
    );
  } catch (_) {
    return false;
  }
}

/** True when running inside Android (Capacitor or WebView user-agent + file/capacitor origin). */
function isAndroidApp() {
  if (typeof window === "undefined") return false;
  try {
    if (window.Capacitor?.getPlatform?.() === "android") return true;
    const ua = navigator.userAgent || "";
    const href = window.location?.href || "";
    if (!/Android/i.test(ua)) return false;
    // In Capacitor/WebView we often get file:// or capacitor:// or no host
    if (/file:\/\//.test(href) || /capacitor:\/\//.test(href)) return true;
    if (!window.location?.host || window.location.host === "localhost") return true;
    return false;
  } catch (_) {
    return false;
  }
}

/** True if url is localhost/127.0.0.1 (useless on device/emulator). */
function isLocalhostUrl(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.replace(/\/+$/, "").toLowerCase();
  return (
    u === "http://localhost:4000" ||
    u === "http://127.0.0.1:4000" ||
    u === "http://localhost:5000" ||
    u === "http://127.0.0.1:5000" ||
    u.startsWith("http://localhost:") ||
    u.startsWith("http://127.0.0.1:")
  );
}

/**
 * Guard API base URL. Checked in order:
 * 1. In development (web): always use /guard-api proxy so browser never uses stale phone URL
 * 2. localStorage (runtime override) – on Android, localhost is ignored and we use 10.0.2.2
 * 3. Build-time REACT_APP_GUARD_API_URL
 * 4. Android app (no saved URL): same default for emulator and phone — cloud Railway URL so clock-in works without a local Node on :5000
 * 5. Local backend on emulator: Login → "Use emulator URL" (10.0.2.2:5000)
 * 6. Default (web dev): http://localhost:4000
 */
function getGuardApiUrl() {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
    return "/guard-api";
  }
  try {
    const saved = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_GUARD_API);
    const url = (saved || "").trim();
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      const normalized = url.replace(/\/+$/, "");
      if (isAndroidApp() && isLocalhostUrl(normalized)) return EMULATOR_GUARD_URL;
      return normalized;
    }
  } catch (_) {}
  if (typeof process !== "undefined" && process.env?.REACT_APP_GUARD_API_URL) {
    return String(process.env.REACT_APP_GUARD_API_URL).replace(/\/+$/, "");
  }
  if (isAndroidApp()) {
    return String(DEFAULT_CLOUD_BACKEND).replace(/\/+$/, "");
  }
  return "http://localhost:4000";
}

function getAdminApiUrl() {
  try {
    const saved = typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_ADMIN_API);
    const url = (saved || "").trim();
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      const normalized = url.replace(/\/+$/, "");
      if (isAndroidApp() && isLocalhostUrl(normalized)) return EMULATOR_ADMIN_URL;
      return normalized;
    }
  } catch (_) {}
  if (typeof process !== "undefined" && process.env?.REACT_APP_ADMIN_API_URL) {
    return String(process.env.REACT_APP_ADMIN_API_URL).replace(/\/+$/, "");
  }
  if (isAndroidApp()) {
    return String(DEFAULT_CLOUD_BACKEND).replace(/\/+$/, "");
  }
  return "http://localhost:5000";
}

/**
 * Single host for `/auth/login`, `/api/guard/*`, etc. when admin-dashboard is one Railway service.
 * Prefer saved **Guard** URL first (login already uses it); else saved **Admin** URL; else defaults.
 * In dev, guard URL is `/guard-api` (relative) — use admin `http://localhost:5000` for absolute axios calls.
 */
function getUnifiedBackendUrl() {
  let savedAdmin = "";
  let savedGuard = "";
  try {
    if (typeof localStorage !== "undefined") {
      savedAdmin = (localStorage.getItem(STORAGE_ADMIN_API) || "").trim();
      savedGuard = (localStorage.getItem(STORAGE_GUARD_API) || "").trim();
    }
  } catch (_) {}

  const guard = getGuardApiUrl().replace(/\/+$/, "");
  const admin = getAdminApiUrl().replace(/\/+$/, "");

  const guardSaved = savedGuard.startsWith("http://") || savedGuard.startsWith("https://");
  const adminSaved = savedAdmin.startsWith("http://") || savedAdmin.startsWith("https://");

  if (guardSaved) return guard;
  if (adminSaved) return admin;

  if (guard.startsWith("/")) return admin;
  return guard;
}

/** Save Guard API URL at runtime (e.g. on phone: set to http://YOUR_MAC_IP:4000) */
function setGuardApiUrl(url) {
  try {
    const u = (url || "").trim().replace(/\/+$/, "");
    if (u) localStorage.setItem(STORAGE_GUARD_API, u);
    else localStorage.removeItem(STORAGE_GUARD_API);
  } catch (_) {}
}

function setAdminApiUrl(url) {
  try {
    const u = (url || "").trim().replace(/\/+$/, "");
    if (u) localStorage.setItem(STORAGE_ADMIN_API, u);
    else localStorage.removeItem(STORAGE_ADMIN_API);
  } catch (_) {}
}

/**
 * On the Android emulator, localhost/127.0.0.1 is the emulator itself — not your Mac.
 * Map to 10.0.2.2 so probes and login hit the host machine (same as curl on Mac).
 */
function rewriteLocalhostForAndroidEmulator(url) {
  if (!url || typeof url !== "string") return url;
  if (!isAndroidApp() || !isProbablyAndroidEmulator()) return url;
  if (!isLocalhostUrl(url)) return url;
  try {
    const parsed = new URL(url.replace(/\/+$/, ""));
    const port = parsed.port || "5000";
    return `http://10.0.2.2:${port}`;
  } catch (_) {
    return EMULATOR_GUARD_URL;
  }
}

/** True if url looks like a LAN IP (e.g. 192.168.x.x) that can go stale after WiFi change. */
function isLanIpUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const u = url.replace(/\/+$/, "").toLowerCase();
    if (u === EMULATOR_GUARD_URL) return false;
    const match = u.match(/^https?:\/\/(\d+\.\d+\.\d+\.\d+)/);
    if (!match) return false;
    const a = match[1].split(".").map(Number);
    if (a[0] === 192 && a[1] === 168) return true;
    if (a[0] === 10 && a[1] === 0 && a[2] === 2 && a[3] === 2) return false;
    if (a[0] === 10) return true;
    return false;
  } catch (_) {
    return false;
  }
}

export {
  getGuardApiUrl,
  getAdminApiUrl,
  getUnifiedBackendUrl,
  setGuardApiUrl,
  setAdminApiUrl,
  isAndroidApp,
  isProbablyAndroidEmulator,
  EMULATOR_GUARD_URL,
  isLanIpUrl,
  DEFAULT_CLOUD_BACKEND,
  rewriteLocalhostForAndroidEmulator,
  normalizeBackendBaseUrl,
};
