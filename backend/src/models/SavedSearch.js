/**
 * Saved Search model (Advanced Search & Filters - UPGRADE_OPTIONS #31)
 * Stores named search queries and filters per admin.
 */
module.exports = (sequelize, DataTypes) => {
  const SavedSearch = sequelize.define(
    "SavedSearch",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      admin_id: {
        type: DataTypes.UUID,
        allowNull: false,
        // No DB FK here: admins table may be "Admins" or "admins"; association in index.js is enough for queries.
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      query: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      filters: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "saved_searches",
      freezeTableName: true,
      timestamps: false,
      underscored: true,
    }
  );
  return SavedSearch;
};
