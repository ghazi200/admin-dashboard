/**
 * Load env for abe-guard-ai: local backend/.env first, then monorepo root .env (no override).
 * So OPENAI_API_KEY etc. can live in admin-dashboard/.env when developing from the monorepo.
 */
const path = require("path");
const fs = require("fs");

const backendRoot = path.resolve(__dirname, "..");
const backendEnv = path.join(backendRoot, ".env");
if (fs.existsSync(backendEnv)) {
  require("dotenv").config({ path: backendEnv });
} else {
  require("dotenv").config();
}

const repoRootEnv = path.resolve(backendRoot, "..", "..", ".env");
if (fs.existsSync(repoRootEnv)) {
  require("dotenv").config({ path: repoRootEnv, override: false });
}
