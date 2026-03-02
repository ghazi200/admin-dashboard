const STORAGE_GUARD_API = "guardApiUrl";
const STORAGE_ADMIN_API = "adminApiUrl";

const EMULATOR_GUARD_URL = "http://10.0.2.2:4000";
const EMULATOR_ADMIN_URL = "http://10.0.2.2:5000";

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
 * 4. Android app: http://10.0.2.2:4000 (emulator → host Mac)
 * 5. Default: http://localhost:4000
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
  if (isAndroidApp()) return EMULATOR_GUARD_URL;
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
  if (isAndroidApp()) return EMULATOR_ADMIN_URL;
  return "http://localhost:5000";
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
  setGuardApiUrl,
  setAdminApiUrl,
  isAndroidApp,
  EMULATOR_GUARD_URL,
  isLanIpUrl,
};
