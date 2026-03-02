// backend/src/models/ScheduledReport.js
module.exports = (sequelize, DataTypes) => {
  const ScheduledReport = sequelize.define(
    "ScheduledReport",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
      },

      tenant_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      template_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      // Schedule configuration
      frequency: {
        type: DataTypes.STRING, // 'daily', 'weekly', 'monthly', 'custom'
        allowNull: false,
      },

      schedule_config: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        // Example: { dayOfWeek: 1, time: "09:00", dayOfMonth: 1 }
      },

      // Email configuration
      email_recipients: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: [],
      },

      email_subject: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      email_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // Export format
      export_format: {
        type: DataTypes.STRING, // 'pdf', 'excel', 'csv', 'html', 'all'
        allowNull: false,
        defaultValue: "pdf",
      },

      // Status
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      last_run_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      next_run_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "scheduled_reports",
      freezeTableName: true,
      timestamps: false,
      underscored: true,
    }
  );

  return ScheduledReport;
};
