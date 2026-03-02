/**
 * CommandCenterAction Model
 * 
 * Stores approved/rejected actions recommended by the Command Center AI.
 * Provides audit trail for all AI-suggested actions.
 */

module.exports = (sequelize, DataTypes) => {
  const CommandCenterAction = sequelize.define(
    "CommandCenterAction",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
      },
      
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: false,
        index: true,
      },
      
      action_type: {
        type: DataTypes.ENUM(
          "REQUEST_BACKUP",
          "TRIGGER_CALLOUT",
          "RAISE_PREMIUM",
          "REQUEST_INSPECTION",
          "ESCALATE_SUPERVISOR",
          "CREATE_FOLLOWUP",
          "NOTIFY_SUPERVISOR",
          "GENERATE_CLIENT_REPORT",
          "MARK_ESCALATION"
        ),
        allowNull: false,
        index: true,
      },
      
      recommended_by_ai: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      
      recommendation_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      
      // Context for the action (what triggered it)
      context: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        // Structure: { shift_id, incident_id, guard_id, risk_score, etc. }
      },
      
      approved_by_admin_id: {
        type: DataTypes.UUID,
        allowNull: true,
        index: true,
      },
      
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      
      rejected_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      
      rejected_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      
      executed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      
      status: {
        type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED", "EXECUTED", "FAILED"),
        defaultValue: "PENDING",
        index: true,
      },
      
      // Result of execution
      outcome_json: {
        type: DataTypes.JSONB,
        allowNull: true,
        // Structure: { success, message, affected_entities, etc. }
      },
      
      confidence_score: {
        type: DataTypes.DECIMAL(3, 2), // 0.00 to 1.00
        allowNull: true,
      },
      
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        index: true,
      },
    },
    {
      tableName: "command_center_actions",
      freezeTableName: true,
      timestamps: false,
      underscored: true,
      indexes: [
        { fields: ["tenant_id", "status"] },
        { fields: ["action_type", "status"] },
        { fields: ["created_at"] },
      ],
    }
  );

  return CommandCenterAction;
};
