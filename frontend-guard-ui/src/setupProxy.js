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
  /**
   * guardClient uses baseURL /guard-api + paths like /api/guard/schedule (admin JWT routes).
   * Without this, /guard-api/api/guard/* hits the generic /guard-api proxy → port 4000 → 404.
   * Must be registered BEFORE the catch-all /guard-api rule.
   */
  app.use(
    "/guard-api/api/guard",
    createProxyMiddleware({
      target: adminApiUrl,
      changeOrigin: true,
      pathRewrite: { "^/guard-api": "" },
    })
  );
  // Clock in/out + breaks live on admin-dashboard (5000); :4000 often not running in dev
  app.use(
    "/guard-api/shifts",
    createProxyMiddleware({
      target: adminApiUrl,
      changeOrigin: true,
      pathRewrite: { "^/guard-api": "" },
    })
  );
  // Guard API (auth, callouts, etc.) – remainder to abe-guard-ai when used
  app.use(
    "/guard-api",
    createProxyMiddleware({
      target: guardApiUrl,
      changeOrigin: true,
      pathRewrite: { "^/guard-api": "" },
    })
  );
};
