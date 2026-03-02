/**
 * Dev proxy:
 * - /api/guard -> admin-dashboard backend (5000)
 * - /guard-api -> Guard backend (4000) so login works without CORS from the Guard UI page
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

const adminApiUrl = process.env.REACT_APP_ADMIN_API_URL || "http://localhost:5000";
const guardApiUrl = process.env.REACT_APP_GUARD_API_URL || "http://localhost:4000";

module.exports = function (app) {
  app.use(
    "/api/guard",
    createProxyMiddleware({
      target: adminApiUrl,
      changeOrigin: true,
    })
  );
  // Guard API (auth, shifts, etc.) – same-origin in dev so login works from Guard UI page
  app.use(
    "/guard-api",
    createProxyMiddleware({
      target: guardApiUrl,
      changeOrigin: true,
      pathRewrite: { "^/guard-api": "" },
    })
  );
};
