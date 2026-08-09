/**
 * Unified compliance-style audit trail (who did what to which entity).
 * Separate from ops_events (Command Center feed).
 */
module.exports = (sequelize, DataTypes) => {
  const AuditEvent = sequelize.define(
    "AuditEvent",
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
        index: true,
      },
      actor_type: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "system",
      },
      actor_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      action: {
        type: DataTypes.STRING(128),
        allowNull: false,
        index: true,
      },
      entity_type: {
        type: DataTypes.STRING(64),
        allowNull: true,
        index: true,
      },
      entity_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      summary: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      before_json: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      after_json: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      meta: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        index: true,
      },
    },
    {
      tableName: "audit_events",
      freezeTableName: true,
      underscored: true,
      timestamps: false,
      indexes: [
        { fields: ["tenant_id", "created_at"] },
        { fields: ["entity_type", "entity_id"] },
      ],
    }
  );
  return AuditEvent;
};
