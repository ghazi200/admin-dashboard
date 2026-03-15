/**
 * Vercel sets REACT_APP_* on process.env during build, but some setups
 * don't expose them to react-scripts. Writing .env.production.local forces
 * Create React App to load the Maps key for production builds.
 */
const fs = require("fs");
const path = require("path");

const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
const root = path.join(__dirname, "..");
const out = path.join(root, ".env.production.local");

if (!key.trim()) {
  console.warn(
    "[inject-maps-key] REACT_APP_GOOGLE_MAPS_API_KEY is empty — Maps will not work until set in Vercel → Env Vars → Redeploy."
  );
  if (fs.existsSync(out)) fs.unlinkSync(out);
  process.exit(0);
}

fs.writeFileSync(out, `REACT_APP_GOOGLE_MAPS_API_KEY=${key}\n`, "utf8");
console.log("[inject-maps-key] Wrote .env.production.local for Maps API (length:", key.length + ")");
