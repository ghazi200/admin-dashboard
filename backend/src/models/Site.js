/**
 * Site model for Geographic Dashboard.
 * Stores locations (sites) with coordinates for map display.
 * Table: sites
 */
module.exports = (sequelize, DataTypes) => {
  const Site = sequelize.define(
    "Site",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      address_1: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      address_2: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      longitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "sites",
      freezeTableName: true,
      timestamps: true,
      underscored: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );
  return Site;
};
