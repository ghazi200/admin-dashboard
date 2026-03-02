/**
 * Staff directory: name, title, contact — maintained by admin, visible to owner.
 * Table: staff_directory
 */
module.exports = (sequelize, DataTypes) => {
  const Staff = sequelize.define(
    "Staff",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      contact: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Phone, email, or other contact info as entered by admin",
      },
    },
    {
      tableName: "staff_directory",
      freezeTableName: true,
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );
  return Staff;
};
