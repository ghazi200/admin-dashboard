/**
 * OpEvent Model
 * 
 * Stores standardized operational events from all sources (incidents, shifts, callouts, inspections, etc.)
 * Used by Command Center for real-time feed, risk scoring, and AI analysis.
 */

module.exports = (sequelize, DataTypes) => {
  const OpEvent = sequelize.define(
    "OpEvent",
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
      
      site_id: {
        type: DataTypes.UUID,
        allowNull: true,
        index: true,
      },
      
      type: {
        type: DataTypes.ENUM(
          "INCIDENT",
          "CALLOUT",
          "INSPECTION",
          "CLOCKIN",
          "SHIFT",
          "COMPLIANCE",
          "PAYROLL"
        ),
        allowNull: false,
        index: true,
      },
      
      severity: {
        type: DataTypes.ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL"),
        allowNull: false,
        defaultValue: "LOW",
        index: true,
      },
      
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      
      summary: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      
      // Entity references (JSONB for flexibility)
      entity_refs: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        // Structure: { incident_id, shift_id, guard_id, inspection_id, etc. }
      },
      
      // AI-enhanced fields
      ai_enhanced: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      
      ai_tags: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        // Structure: { risk_level, category, auto_summary, confidence }
      },
      
      // Original event data (for reference)
      raw_event: {
        type: DataTypes.JSONB,
        allowNull: true,
        // Stores original event payload before standardization
      },
      
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        index: true,
      },
    },
    {
      tableName: "ops_events",
      freezeTableName: true,
      timestamps: false, // Using created_at instead
      underscored: true,
      indexes: [
        { fields: ["tenant_id", "created_at"] },
        { fields: ["site_id", "created_at"] },
        { fields: ["type", "severity"] },
        { fields: ["created_at"] },
      ],
    }
  );

  return OpEvent;
};
