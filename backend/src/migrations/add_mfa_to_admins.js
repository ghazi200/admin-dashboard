"use strict";

/**
 * MFA: add columns to Admins and create mfa_codes table.
 * - Admins: mfa_enabled, mfa_channel ('sms'|'email'), mfa_phone (for SMS)
 * - mfa_codes: one-time codes for login or setup verification
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("Admins").catch(() => null);
    if (tableInfo && !tableInfo.mfa_enabled) {
      await queryInterface.addColumn("Admins", "mfa_enabled", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (tableInfo && !tableInfo.mfa_channel) {
      await queryInterface.addColumn("Admins", "mfa_channel", {
        type: Sequelize.STRING(20),
        allowNull: true,
      });
    }
    if (tableInfo && !tableInfo.mfa_phone) {
      await queryInterface.addColumn("Admins", "mfa_phone", {
        type: Sequelize.STRING(30),
        allowNull: true,
      });
    }

    const mfaCodesExists = await queryInterface.describeTable("mfa_codes").catch(() => null);
    if (mfaCodesExists) return;

    await queryInterface.createTable("mfa_codes", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      admin_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Admins", key: "id" },
        onDelete: "CASCADE",
      },
      code: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      purpose: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "login",
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });
    await queryInterface.addIndex("mfa_codes", ["admin_id"]);
    await queryInterface.addIndex("mfa_codes", ["expires_at"]);
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable("Admins").catch(() => null);
    if (tableInfo && tableInfo.mfa_enabled) await queryInterface.removeColumn("Admins", "mfa_enabled");
    if (tableInfo && tableInfo.mfa_channel) await queryInterface.removeColumn("Admins", "mfa_channel");
    if (tableInfo && tableInfo.mfa_phone) await queryInterface.removeColumn("Admins", "mfa_phone");
    await queryInterface.dropTable("mfa_codes");
  },
};
