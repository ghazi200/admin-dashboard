/**
 * When running in Capacitor (Android/iOS), use native HTTP to bypass WebView CORS.
 * Used for health checks and login so they work reliably on mobile.
 */

/** True when running in Capacitor (Android/iOS) so native HTTP is available. */
export function isNativeCapable() {
  if (typeof window === "undefined") return false;
  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
    const p = window.Capacitor?.getPlatform?.();
    return p === "android" || p === "ios";
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
 * @returns {Promise<{ ok: boolean }>} ok true if status 2xx
 */
export async function nativeGet(url) {
  if (isNativeCapable()) {
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const r = await CapacitorHttp.get({ url });
      return {
        ok: r.status >= 200 && r.status < 300,
        error: r.status >= 200 && r.status < 300 ? undefined : String(r.data || r.status),
      };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
  try {
    const r = await fetch(url);
    return {
      ok: r.ok,
      error: r.ok ? undefined : `HTTP ${r.status}`,
    };
  } catch (e) {
    return { ok: false, error: e?.message || "Network error" };
  }
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
 * POST request with JSON body. In Capacitor uses native HTTP (no CORS).
 * @param {string} url - Full URL
 * @param {object} data - JSON-serializable body
 * @returns {Promise<{ ok: boolean, data?: any, status: number }>}
 */
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
