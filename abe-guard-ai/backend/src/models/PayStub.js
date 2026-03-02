const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Tenant = require("./Tenant");
const Guard = require("./Guard");

const PayStub = sequelize.define(
  "PayStub",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Tenant,
        key: "id",
      },
    },
    guard_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Guard,
        key: "id",
      },
    },

    pay_period_start: { type: DataTypes.DATEONLY, allowNull: false },
    pay_period_end: { type: DataTypes.DATEONLY, allowNull: false },
    pay_date: { type: DataTypes.DATEONLY, allowNull: false },

    // ✅ Validation: payment_method must be one of the allowed values
    payment_method: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: ["DIRECT_DEPOSIT", "CHECK"] },
    },

    hours_worked: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    gross_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    tax_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    deductions_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    net_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },

    tax_breakdown_json: { type: DataTypes.JSONB, allowNull: true },

    file_url: { type: DataTypes.TEXT, allowNull: false },
    file_name: { type: DataTypes.TEXT, allowNull: true },

    created_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "pay_stubs",
    timestamps: false,
  }
);

// Associations are defined in models/index.js
module.exports = PayStub;
