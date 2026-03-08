/**
 * Vercel serverless proxy: forwards /api/* and /health to Railway backend.
 * Use with rewrites so all /api/* and /health hit this handler.
 *
 * Env (in Vercel): RAILWAY_BACKEND_URL = https://admin-dashboard-production-2596.up.railway.app
 *
 * Fixes vs naive proxy:
 * - Forwards full path (backend expects /api/admin/login, not /admin/login)
 * - Forwards Authorization, Cookie, Content-Type
 * - Forwards request body for non-GET
 */

const BACKEND = process.env.RAILWAY_BACKEND_URL || "https://admin-dashboard-production-2596.up.railway.app";
const TIMEOUT_MS = 25000;

// Headers to forward (lowercase)
const FORWARD_HEADERS = [
  "authorization",
  "content-type",
  "cookie",
  "accept",
  "accept-language",
];

function getForwardPath(req) {
  const url = req.url || "";
  const q = url.indexOf("?");
  const pathOnly = q >= 0 ? url.slice(0, q) : url;
  // If request was rewritten, req.url might be /api/proxy; use query if rewrites pass path
  if (pathOnly && pathOnly !== "/api/proxy" && pathOnly.startsWith("/")) {
    return pathOnly;
  }
  const fromQuery = req.query && (req.query.__path || req.query.path);
  if (fromQuery) {
    const p = typeof fromQuery === "string" ? fromQuery : (Array.isArray(fromQuery) ? fromQuery[0] : fromQuery);
    if (p) {
      const s = String(p).trim();
      return s.startsWith("/") ? s : `/${s}`;
    }
  }
  // Vercel rewrites with source "/api/:path*" may pass segment as query; segment might be "admin/login"
  const segment = req.query && (req.query.path ?? req.query.__path);
  if (segment) {
    const s = typeof segment === "string" ? segment : (Array.isArray(segment) ? segment[0] : null);
    if (s && !s.startsWith("/")) return `/api/${s}`;
    if (s) return s;
  }
  return null;
}

export default async function handler(req, res) {
  const path = getForwardPath(req);
  if (!path) {
    res.status(400).json({ error: "Proxy: no path. Configure rewrites so /api/* and /health hit this function with path." });
    return;
  }

  const url = `${BACKEND.replace(/\/+$/, "")}${path}${req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`;

  const headers = {};
  FORWARD_HEADERS.forEach((h) => {
    const v = req.headers[h] || req.headers[h.toLowerCase()];
    if (v) headers[h] = v;
  });
  if (!headers["content-type"]) headers["content-type"] = "application/json";

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (req.body != null) {
      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }
  }

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: req.method || "GET",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(to);

    const contentType = response.headers.get("content-type");
    const text = await response.text();
    res.status(response.status);
    if (contentType) res.setHeader("Content-Type", contentType);
    res.send(text);
  } catch (err) {
    clearTimeout(to);
    const code = err.name === "AbortError" ? 504 : 502;
    res.status(code).json({
      error: err.name === "AbortError" ? "Backend timeout" : "Backend unreachable",
      message: err.message || String(err),
    });
  }
}
