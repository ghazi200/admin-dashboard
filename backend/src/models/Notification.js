module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    "Notification",
    {
      type: { type: DataTypes.STRING, allowNull: false }, // e.g. "SHIFT_FILLED"
      title: { type: DataTypes.STRING, allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },

      // For navigation in UI
      entityType: { type: DataTypes.STRING, allowNull: true }, // "shift", "guard", "callout"
      entityId: { type: DataTypes.STRING, allowNull: true }, // Changed from INTEGER to STRING to support UUIDs

      // targeting
      audience: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "all", // "all" | "admin" | "supervisor"
      },

      // metadata
      meta: { type: DataTypes.JSON, allowNull: true },

      // Smart notification fields
      priority: {
        type: DataTypes.ENUM("CRITICAL", "HIGH", "MEDIUM", "LOW"),
        allowNull: true,
        defaultValue: null,
      },
      category: {
        type: DataTypes.ENUM("COVERAGE", "INCIDENT", "PERSONNEL", "COMPLIANCE", "AI_INSIGHTS", "REPORTS", "GENERAL"),
        allowNull: true,
        defaultValue: null,
      },
      urgency: {
        type: DataTypes.ENUM("URGENT", "NORMAL", "LOW"),
        allowNull: true,
        defaultValue: null,
      },
      smartMetadata: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
      },
      aiInsights: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
      },
      quickActions: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
      },

      // read tracking (simple approach: per-user read status is separate table below)
    },
    { timestamps: true }
  );

  return Notification;
};
