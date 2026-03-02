// backend/src/models/ReportTemplate.js
module.exports = (sequelize, DataTypes) => {
  const ReportTemplate = sequelize.define(
    "ReportTemplate",
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

      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      category: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "custom",
      },

      // Widget configuration (JSON array of widget definitions)
      widgets: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },

      // Report settings (filters, date ranges, etc.)
      settings: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },

      // Template metadata
      is_public: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      is_default: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      tableName: "report_templates",
      freezeTableName: true,
      timestamps: false,
      underscored: true,
    }
  );

  return ReportTemplate;
};
