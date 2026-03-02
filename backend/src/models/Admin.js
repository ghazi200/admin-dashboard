// backend/src/models/Admin.js
module.exports = (sequelize, DataTypes) => {
  const Admin = sequelize.define("Admin", {
    name: { type: DataTypes.STRING, allowNull: false, defaultValue: "Admin" },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: "admin" },

    // ✅ New: permanent permission overrides
    // Stored as JSON array: ["guards:write", "shifts:delete"]
    permissions: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },

    // ✅ Multi-tenant support: tenant_id (UUID) - allows NULL for migration period
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true, // Allow NULL initially for backward compatibility
      // Note: If you have a tenants table, uncomment below:
      // references: { model: 'tenants', key: 'id' },
    },

    // ✅ MFA: SMS or email code
    mfa_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    mfa_channel: { type: DataTypes.STRING(20), allowNull: true }, // 'sms' | 'email'
    mfa_phone: { type: DataTypes.STRING(30), allowNull: true },

    // ✅ Single session: increment on login / logout-other-devices; JWT must match or 401
    session_token_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  });

  return Admin;
};
