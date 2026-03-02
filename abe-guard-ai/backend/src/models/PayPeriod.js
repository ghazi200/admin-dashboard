const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Tenant = require("./Tenant");
const Admin = require("./Admin");

const PayPeriod = sequelize.define(
  "PayPeriod",
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

    period_start: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    period_end: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    period_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "BIWEEKLY",
      validate: {
        isIn: [["WEEKLY", "BIWEEKLY", "MONTHLY", "SEMIMONTHLY"]],
      },
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "OPEN",
      validate: {
        isIn: [["OPEN", "LOCKED", "CLOSED", "PAID"]],
      },
    },

    locked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    locked_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: Admin,
        key: "id",
      },
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "pay_periods",
    timestamps: false,
  }
);

module.exports = PayPeriod;
