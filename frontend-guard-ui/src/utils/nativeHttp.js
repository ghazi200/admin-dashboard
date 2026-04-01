/**
 * When running in Capacitor (Android/iOS), use native HTTP to bypass WebView CORS.
 * Used for health checks and login so they work reliably on mobile.
 */

import { rewriteLocalhostForAndroidEmulator, normalizeBackendBaseUrl } from "../config/apiUrls";

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

/** Railway cold start + some emulators need generous timeouts */
const CAP_HTTP_LONG = { connectTimeout: 60000, readTimeout: 60000 };

/**
 * Capacitor OkHttp sometimes fails HTTPS on emulators while WebView fetch works.
 * Only fall back when we did not get a real HTTP status (avoid double-submit on 401/500).
 */
function shouldUseFetchFallback(status) {
  const n = Number(status);
  return !Number.isFinite(n) || n <= 0;
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
 * WebView fetch — TLS/DNS path can differ from CapacitorHttp on some emulators.
 */
async function probeWithFetch(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 30000);
    const r = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(id);
    const ok = r.ok;
    return {
      ok,
      status: r.status,
      error: ok ? undefined : `HTTP ${r.status}`,
    };
  } catch (e) {
    const msg = e?.name === "AbortError" ? "Request timed out (30s)" : e?.message || String(e);
    return { ok: false, status: 0, error: msg };
  }
}

/**
 * Probe admin-dashboard base URL: try /health then / (cold Node can be slow).
 * @param {string} base - e.g. http://10.0.2.2:5000
 */
export async function probeBackendBase(base) {
  let b = normalizeBackendBaseUrl(base) || String(base || "").replace(/\/+$/, "");
  b = rewriteLocalhostForAndroidEmulator(b);
  if (!b.startsWith("http://") && !b.startsWith("https://")) {
    return { ok: false, status: 0, error: "Invalid URL", lastUrl: "" };
  }
  const t = { connectTimeout: 25000, readTimeout: 25000 };
  const healthUrl = `${b}/health`;
  const rootUrl = `${b}/`;

  let r = await nativeGet(healthUrl, t);
  if (r.ok) return { ...r, lastUrl: healthUrl };
  r = await nativeGet(rootUrl, t);
  if (r.ok) return { ...r, lastUrl: rootUrl };

  // CapacitorHttp sometimes fails HTTPS on emulators; WebView fetch often succeeds.
  if (isNativeCapable()) {
    let f = await probeWithFetch(healthUrl);
    if (f.ok) return { ...f, lastUrl: healthUrl };
    f = await probeWithFetch(rootUrl);
    if (f.ok) return { ...f, lastUrl: rootUrl };
    return {
      ok: false,
      status: f.status ?? 0,
      error: f.error || r.error || "Unreachable",
      lastUrl: healthUrl,
      alsoTried: rootUrl,
      detail: `Native HTTP: ${r.error || "failed"}. Fetch: ${f.error || "failed"}.`,
    };
  }

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
  const mergedHeaders = { Accept: "application/json", ...headers };

  async function viaFetch() {
    try {
      const r = await fetch(url, { headers: mergedHeaders, cache: "no-store" });
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

  if (isNativeCapable()) {
    let st = 0;
    let parsed;
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const r = await CapacitorHttp.get({
        url,
        headers: mergedHeaders,
        ...CAP_HTTP_LONG,
      });
      st = r.status;
      parsed = parseCapacitorBody(r.data);
      const ok = r.status >= 200 && r.status < 300;
      if (ok) return { ok: true, status: r.status, data: parsed };
      if (!shouldUseFetchFallback(st)) {
        return {
          ok: false,
          status: r.status,
          data: parsed,
          error: String(parsed?.message || parsed?.error || r.status),
        };
      }
    } catch (e) {
      st = e.status || 0;
      if (!shouldUseFetchFallback(st)) {
        return { ok: false, status: st, data: null, error: e?.message || String(e) };
      }
    }
    return viaFetch();
  }

  return viaFetch();
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

  async function viaFetch() {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: merged,
        body: JSON.stringify(data || {}),
        cache: "no-store",
      });
      const body = await r.json().catch(() => ({}));
      const ok = r.ok;
      return {
        ok,
        status: r.status,
        data: body,
        error: ok ? undefined : String(body?.message || body?.error || `HTTP ${r.status}`),
      };
    } catch (e) {
      return { ok: false, status: 0, data: null, error: e?.message || "Network error" };
    }
  }

  if (isNativeCapable()) {
    let st = 0;
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const r = await CapacitorHttp.post({
        url,
        data: data || {},
        headers: merged,
        ...CAP_HTTP_LONG,
      });
      st = r.status;
      const parsed = parseCapacitorBody(r.data);
      const ok = r.status >= 200 && r.status < 300;
      if (ok) return { ok: true, status: r.status, data: parsed };
      if (!shouldUseFetchFallback(st)) {
        return {
          ok: false,
          status: r.status,
          data: parsed,
          error: String(parsed?.message || parsed?.error || `HTTP ${r.status}`),
        };
      }
    } catch (e) {
      st = e.status || 0;
      if (!shouldUseFetchFallback(st)) {
        return { ok: false, status: st, data: null, error: e?.message || String(e) };
      }
    }
    return viaFetch();
  }

  return viaFetch();
}

export async function nativePost(url, data) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };

  async function viaFetch() {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(data || {}),
        cache: "no-store",
      });
      const body = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data: body };
    } catch (e) {
      return { ok: false, status: 0, data: null, error: e?.message };
    }
  }

  if (isNativeCapable()) {
    let st = 0;
    let parsed;
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const r = await CapacitorHttp.post({
        url,
        data: data || {},
        headers,
        ...CAP_HTTP_LONG,
      });
      st = r.status;
      parsed = parseCapacitorBody(r.data);
      const ok = r.status >= 200 && r.status < 300;
      if (ok) return { ok: true, status: r.status, data: parsed };
      if (!shouldUseFetchFallback(st)) {
        return { ok: false, status: r.status, data: parsed };
      }
    } catch (e) {
      st = e.status || 0;
      if (!shouldUseFetchFallback(st)) {
        return { ok: false, status: st, data: null, error: e?.message };
      }
    }
    return viaFetch();
  }

  return viaFetch();
}
