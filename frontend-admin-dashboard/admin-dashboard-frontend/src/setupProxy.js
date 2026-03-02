/**
 * Explicit proxy so /api/* goes to the backend (5000).
 * More reliable than package.json "proxy" when both frontend and backend are running.
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:5000",
      changeOrigin: true,
    })
  );
};
