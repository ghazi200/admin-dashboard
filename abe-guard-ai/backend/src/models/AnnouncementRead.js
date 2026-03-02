const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const AnnouncementRead = sequelize.define(
  "AnnouncementRead",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    announcement_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    guard_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "announcement_reads",
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["announcement_id", "guard_id"],
        name: "unique_announcement_guard_read",
      },
    ],
  }
);

module.exports = AnnouncementRead;
