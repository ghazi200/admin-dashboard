/**
 * Vercel catch-all: forwards /api/* and /api/health (rewritten from /health) to Railway.
 * Path segments are in req.query.path (e.g. ["admin", "login"] for /api/admin/login).
 *
 * Env (Vercel): RAILWAY_BACKEND_URL = https://admin-dashboard-production-2596.up.railway.app
 */

const BACKEND = process.env.RAILWAY_BACKEND_URL || "https://admin-dashboard-production-2596.up.railway.app";
const TIMEOUT_MS = 25000;

const FORWARD_HEADERS = [
  "authorization",
  "content-type",
  "cookie",
  "accept",
  "accept-language",
];

export default async function handler(req, res) {
  const pathSegments = req.query.path;
  if (!pathSegments || !Array.isArray(pathSegments) || pathSegments.length === 0) {
    res.status(400).json({ error: "Proxy: no path segments." });
    return;
  }

  // /health is rewritten to /api/health → path = ["health"]; backend expects /health not /api/health
  const backendPath =
    pathSegments.length === 1 && pathSegments[0] === "health"
      ? "/health"
      : "/api/" + pathSegments.join("/");

  const qs = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const url = `${BACKEND.replace(/\/+$/, "")}${backendPath}${qs}`;

  const headers = {};
  FORWARD_HEADERS.forEach((h) => {
    const v = req.headers[h] || req.headers[h.toLowerCase()];
    if (v) headers[h] = v;
  });
  if (!headers["content-type"]) headers["content-type"] = "application/json";

  let body;
  if (req.method !== "GET" && req.method !== "HEAD" && req.body != null) {
    body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
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
    const contentType = response.headers.get("Content-Type");
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
