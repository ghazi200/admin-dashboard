/**
 * Structured logger (pino) for admin backend.
 * - Production: JSON to stdout (level, msg, time, reqId when set).
 * - Development: pretty-printed for readability.
 * Set LOG_LEVEL=debug|info|warn|error to control verbosity (default: info).
 */
const pino = require("pino");

const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL || (isProd ? "info" : "info");

const opts = {
  level,
  base: { name: "admin-backend" },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// In development with TTY, use pino-pretty for human-readable logs (if installed)
let dest = pino.destination({ dest: 1, sync: false, minLength: 4096 });
if (!isProd && process.stdout.isTTY) {
  try {
    const pretty = require("pino-pretty");
    dest = pretty({ colorize: true, translateTime: "SYS:standard" });
  } catch (_) {
    // pino-pretty not installed (e.g. in CI), use JSON
  }
}

const logger = pino(opts, dest);

module.exports = logger;
