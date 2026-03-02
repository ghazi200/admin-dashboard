module.exports = (sequelize, DataTypes) => {
  const Guard = sequelize.define('Guard', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: true, unique: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    active: { 
      type: DataTypes.BOOLEAN, 
      defaultValue: true,
      field: 'is_active', // Map to database column 'is_active'
    },
    weekly_hours: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    acceptance_rate: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    reliability_score: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    profile_photo_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // ✅ Multi-tenant support: tenant_id (UUID) - exists in database
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'tenant_id', // Explicitly map to database column
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Account lock after 5 failed login attempts; admin can unlock
    failed_login_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    locked_until: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'guards',
    freezeTableName: true,
    underscored: true, // Use snake_case for database columns
    timestamps: false, // Disable automatic timestamps since we have created_at
  });
  return Guard;
};
