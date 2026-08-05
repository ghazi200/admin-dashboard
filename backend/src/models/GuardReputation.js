/**
 * Guard Reputation model (admin backend).
 * reviewed_by_admin_id is INTEGER to match "Admins".id.
 */
module.exports = (sequelize, DataTypes) => {
  const GuardReputation = sequelize.define(
    "GuardReputation",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      tenant_id: { type: DataTypes.UUID, allowNull: true },
      guard_id: { type: DataTypes.UUID, allowNull: false },
      trust_score: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.5,
      },
      reviewed_by_admin_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      score: { type: DataTypes.DECIMAL(3, 2), allowNull: true },
      comment: { type: DataTypes.TEXT, allowNull: true },
      review_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: "general",
      },
      related_shift_id: { type: DataTypes.UUID, allowNull: true },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "guard_reputation",
      freezeTableName: true,
      timestamps: false,
      underscored: true,
    }
  );
  return GuardReputation;
};
