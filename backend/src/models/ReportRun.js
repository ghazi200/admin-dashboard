// backend/src/models/ReportRun.js
module.exports = (sequelize, DataTypes) => {
  const ReportRun = sequelize.define(
    "ReportRun",
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
        allowNull: true,
      },

      scheduled_report_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      // Report data snapshot
      report_data: {
        type: DataTypes.JSONB,
        allowNull: false,
      },

      // Generated files
      file_paths: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        // Example: { pdf: "/reports/abc123.pdf", excel: "/reports/abc123.xlsx" }
      },

      // Export formats generated
      formats: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: [],
      },

      // Status
      status: {
        type: DataTypes.STRING, // 'pending', 'generating', 'completed', 'failed'
        allowNull: false,
        defaultValue: "pending",
      },

      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      // Metadata
      generated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      generated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "report_runs",
      freezeTableName: true,
      timestamps: false,
      underscored: true,
    }
  );

  return ReportRun;
};
