// backend/src/config/config.js
require("dotenv").config();

const common = {
  dialect: "postgres",
  logging: false,
};

module.exports = {
  development: {
    ...common,
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
  },

  test: {
    ...common,
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
  },

  production: {
    ...common,
    // ✅ use DATABASE_URL in production
    use_env_variable: "DATABASE_URL",
    dialectOptions:
      process.env.DB_SSL === "true"
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
  },
};
