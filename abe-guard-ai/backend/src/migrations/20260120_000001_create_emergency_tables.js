/**
 * Migration: Create Emergency SOS Tables
 *
 * emergency_events / emergency_contacts — idempotent for partial runs
 * (e.g. index "emergency_events_guard_id" already exists).
 */

"use strict";

async function tableExists(queryInterface, name) {
  try {
    await queryInterface.describeTable(name);
    return true;
  } catch {
    return false;
  }
}

/** Postgres: create index only if missing (avoids "already exists"). */
async function addIndexIfNotExists(sequelize, name, table, columnSql) {
  await sequelize.query(
    `CREATE INDEX IF NOT EXISTS "${name}" ON "${table}" (${columnSql});`
  );
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, "emergency_events"))) {
      await queryInterface.createTable("emergency_events", {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: Sequelize.UUIDV4,
        },
        guard_id: {
          type: Sequelize.UUID,
          allowNull: false,
          comment: "Guard who activated the emergency",
        },
        tenant_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: "Tenant for multi-tenant isolation",
        },
        supervisor_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: "On-call supervisor who was notified",
        },
        latitude: {
          type: Sequelize.DOUBLE,
          allowNull: true,
          comment: "Guard's GPS latitude at time of activation",
        },
        longitude: {
          type: Sequelize.DOUBLE,
          allowNull: true,
          comment: "Guard's GPS longitude at time of activation",
        },
        accuracy: {
          type: Sequelize.DOUBLE,
          allowNull: true,
          comment: "GPS accuracy in meters",
        },
        status: {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: "active",
          comment: "Status: active, resolved, cancelled",
        },
        resolved_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: "When the emergency was resolved",
        },
        resolved_by: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: "Admin/supervisor who resolved the emergency",
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: "Additional notes about the emergency",
        },
        activated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      });
    }

    if (!(await tableExists(queryInterface, "emergency_contacts"))) {
      await queryInterface.createTable("emergency_contacts", {
        id: {
          type: Sequelize.UUID,
          allowNull: false,
          primaryKey: true,
          defaultValue: Sequelize.UUIDV4,
        },
        guard_id: {
          type: Sequelize.UUID,
          allowNull: false,
          comment: "Guard who owns this contact",
        },
        tenant_id: {
          type: Sequelize.UUID,
          allowNull: true,
          comment: "Tenant for multi-tenant isolation",
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false,
          comment: "Contact name",
        },
        phone: {
          type: Sequelize.STRING,
          allowNull: false,
          comment: "Contact phone number",
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      });
    }

    const { sequelize } = queryInterface;

    await addIndexIfNotExists(sequelize, "emergency_events_guard_id", "emergency_events", '"guard_id"');
    await addIndexIfNotExists(sequelize, "emergency_events_tenant_id", "emergency_events", '"tenant_id"');
    await addIndexIfNotExists(sequelize, "emergency_events_supervisor_id", "emergency_events", '"supervisor_id"');
    await addIndexIfNotExists(sequelize, "emergency_events_status", "emergency_events", '"status"');
    await addIndexIfNotExists(sequelize, "emergency_events_activated_at", "emergency_events", '"activated_at"');

    await addIndexIfNotExists(sequelize, "emergency_contacts_guard_id", "emergency_contacts", '"guard_id"');
    await addIndexIfNotExists(sequelize, "emergency_contacts_tenant_id", "emergency_contacts", '"tenant_id"');
  },

  async down(queryInterface) {
    await queryInterface.dropTable("emergency_contacts");
    await queryInterface.dropTable("emergency_events");
  },
};
