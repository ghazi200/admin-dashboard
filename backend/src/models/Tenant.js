// backend/src/models/Tenant.js
module.exports = (sequelize, DataTypes) => {
  const Tenant = sequelize.define(
    "Tenant",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      domain: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },

      contact_email: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      contact_phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      location: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      monthly_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },

      subscription_plan: {
        type: DataTypes.ENUM("free", "basic", "pro", "enterprise"),
        allowNull: false,
        defaultValue: "free",
      },

      features: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {
          dashboard: true,
          analytics: false,
          ai_optimization: false,
          callout_prediction: false,
          report_builder: false,
          smart_notifications: false,
          scheduled_reports: false,
          multi_location: false,
          api_access: false,
          white_label: false,
        },
      },

      status: {
        type: DataTypes.ENUM("active", "suspended", "trial", "inactive"),
        allowNull: false,
        defaultValue: "trial",
      },

      trial_ends_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      max_guards: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null, // null = unlimited
      },

      max_locations: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null, // null = unlimited
      },

      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "tenants",
      freezeTableName: true,
      timestamps: false,
      underscored: true,
    }
  );

  return Tenant;
};
