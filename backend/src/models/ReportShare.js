// backend/src/models/ReportShare.js
module.exports = (sequelize, DataTypes) => {
  const ReportShare = sequelize.define(
    "ReportShare",
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

      report_run_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      // Share type: 'link' or 'direct'
      share_type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "link",
      },

      // Shareable link token
      share_token: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },

      // Direct share recipients
      recipients: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        defaultValue: [],
      },

      // Permission level
      permission: {
        type: DataTypes.STRING, // 'view', 'comment', 'edit'
        allowNull: false,
        defaultValue: "view",
      },

      // Security settings
      password_protected: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      password_hash: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      // Tracking
      view_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      last_viewed_at: {
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
    },
    {
      tableName: "report_shares",
      freezeTableName: true,
      timestamps: false,
      underscored: true,
    }
  );

  return ReportShare;
};
