/**
 * NotificationPreference Model
 * 
 * Stores user-specific notification preferences
 * - Which types of notifications to receive
 * - Priority thresholds
 * - Category filters
 * - Delivery preferences
 * - Grouping preferences
 */

module.exports = (sequelize, DataTypes) => {
  const NotificationPreference = sequelize.define(
    "NotificationPreference",
    {
      adminId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
      },

      // Priority filters
      minPriority: {
        type: DataTypes.ENUM("CRITICAL", "HIGH", "MEDIUM", "LOW"),
        allowNull: true,
        defaultValue: null, // null = no filter (show all)
        comment: "Minimum priority level to show (inclusive)",
      },

      // Category filters (JSON array of allowed categories)
      allowedCategories: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null, // null = all categories
        comment: "Array of allowed categories: ['COVERAGE', 'INCIDENT', etc.]",
      },

      // Type filters (JSON array of allowed notification types)
      allowedTypes: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null, // null = all types
        comment: "Array of allowed notification types: ['SHIFT_CLOSED', 'CALLOUT_CREATED', etc.]",
      },

      // Blocked types (JSON array of blocked notification types)
      blockedTypes: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        comment: "Array of blocked notification types",
      },

      // Delivery preferences
      enableRealtime: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Receive real-time notifications via socket",
      },

      enableDigest: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Enable digest summaries for non-critical notifications",
      },

      digestFrequency: {
        type: DataTypes.ENUM("HOURLY", "DAILY", "WEEKLY"),
        allowNull: true,
        defaultValue: "DAILY",
        comment: "How often to receive digest summaries",
      },

      // Grouping preferences
      groupBy: {
        type: DataTypes.ENUM("PRIORITY", "CATEGORY", "NONE"),
        allowNull: false,
        defaultValue: "PRIORITY",
        comment: "How to group notifications in UI",
      },

      // Display preferences
      showAIInsights: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Show AI-generated insights in notifications",
      },

      showQuickActions: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Show quick action buttons",
      },

      // Sound/Alert preferences
      enableSound: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Play sound for new notifications",
      },

      soundForPriority: {
        type: DataTypes.ENUM("CRITICAL", "HIGH", "MEDIUM", "LOW", "ALL"),
        allowNull: false,
        defaultValue: "HIGH",
        comment: "Play sound for notifications at or above this priority",
      },

      // Advanced filters
      customFilters: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
        comment: "Custom filter rules (advanced)",
      },
    },
    {
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["adminId"],
        },
      ],
    }
  );

  return NotificationPreference;
};
