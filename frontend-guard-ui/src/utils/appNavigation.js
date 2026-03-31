/**
 * Full-page redirects (logout, 401). Same pattern as before Capacitor hash experiments.
 * App uses BrowserRouter; paths stay on https://localhost (Capacitor local server).
 */

export function isCapacitorNative() {
  if (typeof window === "undefined") return false;
  try {
    if (window.Capacitor?.isNativePlatform?.() === true) return true;
    const p = window.Capacitor?.getPlatform?.();
    return p === "android" || p === "ios";
  } catch {
    return false;
  }
}

export function appHardNavigate(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  window.location.href = p;
}

export function isAppOnLoginRoute() {
  if (typeof window === "undefined") return false;
  return window.location.pathname.includes("/login");
}
