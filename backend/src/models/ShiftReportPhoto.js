// backend/src/models/ShiftReportPhoto.js
module.exports = (sequelize, DataTypes) => {
  const ShiftReportPhoto = sequelize.define(
    "ShiftReportPhoto",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      shift_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      photo_url: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      photo_type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "incident",
        validate: {
          isIn: [["incident", "maintenance", "visitor", "other"]],
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      uploaded_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "shift_report_photos",
      freezeTableName: true,
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
    }
  );

  return ShiftReportPhoto;
};
