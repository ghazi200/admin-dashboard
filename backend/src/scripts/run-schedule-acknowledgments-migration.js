#!/usr/bin/env node
"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

async function main() {
  const { sequelize } = require("../models");
  const migration = require("../migrations/add_schedule_acknowledgments");
  await sequelize.authenticate();
  await migration.up(sequelize.getQueryInterface(), require("sequelize"));
  await sequelize.close();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
