/**
 * Incident Model
 * Extended schema with all columns for detailed incident tracking
 */

module.exports = (sequelize, DataTypes) => {
  const Incident = sequelize.define(
    "Incident",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      tenantId: {
        type: DataTypes.UUID,
        field: "tenant_id",
        allowNull: true,
      },
      guardId: {
        type: DataTypes.UUID,
        field: "guard_id",
        allowNull: true,
      },
      shiftId: {
        type: DataTypes.UUID,
        field: "shift_id",
        allowNull: true,
      },
      siteId: {
        type: DataTypes.UUID,
        field: "site_id",
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: "OPEN",
      },
      severity: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: "MEDIUM",
      },
      occurredAt: {
        type: DataTypes.DATE,
        field: "occurred_at",
        allowNull: true,
      },
      reportedAt: {
        type: DataTypes.DATE,
        field: "reported_at",
        allowNull: true,
      },
      locationText: {
        type: DataTypes.TEXT,
        field: "location_text",
        allowNull: true,
      },
      aiSummary: {
        type: DataTypes.TEXT,
        field: "ai_summary",
        allowNull: true,
      },
      aiTagsJson: {
        type: DataTypes.JSONB,
        field: "ai_tags_json",
        allowNull: true,
      },
      attachmentsJson: {
        type: DataTypes.JSONB,
        field: "attachments_json",
        allowNull: true,
      },
    },
    {
      tableName: "incidents",
      freezeTableName: true,
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  return Incident;
};
