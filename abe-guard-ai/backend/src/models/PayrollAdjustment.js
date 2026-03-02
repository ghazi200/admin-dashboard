const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Tenant = require("./Tenant");
const Guard = require("./Guard");
const PayPeriod = require("./PayPeriod");
const Timesheet = require("./Timesheet");
const Admin = require("./Admin");

const PayrollAdjustment = sequelize.define(
  "PayrollAdjustment",
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

    pay_period_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: PayPeriod,
        key: "id",
      },
    },

    timesheet_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: Timesheet,
        key: "id",
      },
    },

    adjustment_type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isIn: [["BONUS", "DEDUCTION", "CORRECTION", "AI_SUGGESTED"]],
      },
    },

    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "DRAFT",
      validate: {
        isIn: [["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "APPLIED"]],
      },
    },

    suggested_by_ai: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    ai_suggestion_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    requested_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: Admin,
        key: "id",
      },
    },

    approved_by_admin_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: Admin,
        key: "id",
      },
    },

    approved_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    applied_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "payroll_adjustments",
    timestamps: false,
  }
);

module.exports = PayrollAdjustment;
