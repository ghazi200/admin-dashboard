/**
 * When running in Capacitor (Android/iOS), use native HTTP to bypass WebView CORS.
 * Used for health checks and login so they work reliably on mobile.
 */

import { rewriteLocalhostForAndroidEmulator } from "../config/apiUrls";

/** True when running in Capacitor (Android/iOS) so native HTTP is available. */
export function isNativeCapable() {
  if (typeof window === "undefined") return false;
  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
    const p = window.Capacitor?.getPlatform?.();
    if (p === "android" || p === "ios") return true;
    const pl = typeof p === "string" ? p.toLowerCase() : "";
    return pl === "android" || pl === "ios";
  } catch (_) {
    return false;
  }
}

function parseCapacitorBody(data) {
  if (data == null) return data;
  if (typeof data === "object" && !Array.isArray(data)) return data;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (_) {
      return { _raw: data };
    }
  }
  return data;
}

/**
 * GET request. In Capacitor app uses native HTTP (no CORS); otherwise fetch.
 * @param {string} url - Full URL
 * @param {{ connectTimeout?: number, readTimeout?: number }} [timeouts] - ms; native only (default 20s)
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function nativeGet(url, timeouts = {}) {
  const connectTimeout = timeouts.connectTimeout ?? 20000;
  const readTimeout = timeouts.readTimeout ?? 20000;

  if (isNativeCapable()) {
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const r = await CapacitorHttp.get({
        url,
        connectTimeout,
        readTimeout,
      });
      const st = Number(r.status);
      const ok = Number.isFinite(st) && st >= 200 && st < 300;
      let errDetail;
      if (!ok) {
        const body =
          typeof r.data === "string"
            ? r.data.slice(0, 120)
            : r.data && typeof r.data === "object"
              ? JSON.stringify(r.data).slice(0, 120)
              : "";
        errDetail = body ? `HTTP ${st} — ${body}` : `HTTP ${st}`;
      }
      return {
        ok,
        status: st,
        error: ok ? undefined : errDetail,
      };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        error: e?.message || String(e),
      };
    }
  }
  try {
    const r = await fetch(url);
    return {
      ok: r.ok,
      status: r.status,
      error: r.ok ? undefined : `HTTP ${r.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e?.message || "Network error",
    };
  }
}

/**
 * Probe admin-dashboard base URL: try /health then / (cold Node can be slow).
 * @param {string} base - e.g. http://10.0.2.2:5000
 */
export async function probeBackendBase(base) {
  let b = String(base || "").replace(/\/+$/, "");
  b = rewriteLocalhostForAndroidEmulator(b);
  if (!b.startsWith("http://") && !b.startsWith("https://")) {
    return { ok: false, status: 0, error: "Invalid URL", lastUrl: "" };
  }
  const t = { connectTimeout: 25000, readTimeout: 25000 };
  const healthUrl = `${b}/health`;
  let r = await nativeGet(healthUrl, t);
  if (r.ok) return { ...r, lastUrl: healthUrl };
  const rootUrl = `${b}/`;
  r = await nativeGet(rootUrl, t);
  if (r.ok) return { ...r, lastUrl: rootUrl };
  return {
    ok: false,
    status: r.status ?? 0,
    error: r.error || `Unreachable`,
    lastUrl: healthUrl,
    alsoTried: rootUrl,
  };
}

/**
 * Authenticated GET returning parsed JSON (for guard API after login on Capacitor).
 * @param {string} url - Full URL
 * @param {Record<string, string>} headers - e.g. { Authorization: "Bearer ..." }
 * @returns {Promise<{ ok: boolean, status: number, data?: any, error?: string }>}
 */
export async function nativeGetJson(url, headers = {}) {
  if (isNativeCapable()) {
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const r = await CapacitorHttp.get({
        url,
        headers: { Accept: "application/json", ...headers },
      });
      const parsed = parseCapacitorBody(r.data);
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        data: parsed,
        error:
          r.status >= 200 && r.status < 300
            ? undefined
            : String(parsed?.message || parsed?.error || r.status),
      };
    } catch (e) {
      return { ok: false, status: e.status || 0, data: null, error: e?.message || String(e) };
    }
  }
  try {
    const r = await fetch(url, { headers: { Accept: "application/json", ...headers } });
    const body = await r.json().catch(() => ({}));
    return {
      ok: r.ok,
      status: r.status,
      data: body,
      error: r.ok ? undefined : String(body?.message || body?.error || r.status),
    };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e?.message || "Network error" };
  }
}

/**
 * POST JSON with extra headers (e.g. Authorization). Same transport as nativeGetJson.
 */
export async function nativePostJson(url, data, headers = {}) {
  const merged = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...headers,
  };
  if (isNativeCapable()) {
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const r = await CapacitorHttp.post({
        url,
        data: data || {},
        headers: merged,
      });
      const parsed = parseCapacitorBody(r.data);
      const ok = r.status >= 200 && r.status < 300;
      return {
        ok,
        status: r.status,
        data: parsed,
        error: ok ? undefined : String(parsed?.message || parsed?.error || `HTTP ${r.status}`),
      };
    } catch (e) {
      return { ok: false, status: e.status || 0, data: null, error: e?.message || String(e) };
    }
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: merged,
      body: JSON.stringify(data || {}),
    });
    const body = await r.json().catch(() => ({}));
    return {
      ok: r.ok,
      status: r.status,
      data: body,
      error: r.ok ? undefined : String(body?.message || body?.error || r.status),
    };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e?.message || "Network error" };
  }
}

export async function nativePost(url, data) {
  if (isNativeCapable()) {
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const r = await CapacitorHttp.post({
        url,
        data: data || {},
        headers: { "Content-Type": "application/json" },
      });
      const parsed = parseCapacitorBody(r.data);
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        data: parsed,
      };
    } catch (e) {
      return { ok: false, status: e.status || 0, data: null, error: e?.message };
    }
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data || {}),
    });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: body };
  } catch (_) {
    return { ok: false, status: 0, data: null };
  }
}
