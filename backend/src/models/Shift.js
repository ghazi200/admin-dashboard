// backend/src/models/Shift.js
module.exports = (sequelize, DataTypes) => {
  const Shift = sequelize.define(
    "Shift",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
      },

      tenant_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      guard_id: {
        // ✅ real column is guard_id (uuid)
        type: DataTypes.UUID,
        allowNull: true,
      },

      shift_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },

      shift_start: {
        // DB is TIME, but Sequelize can safely treat it as string for display
        type: DataTypes.STRING,
        allowNull: true,
      },

      shift_end: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      status: {
        // ✅ DB column is TEXT (values like 'OPEN', 'CLOSED')
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "OPEN",
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      ai_decision: {
        type: DataTypes.JSONB,
        allowNull: true,
      },

      location: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      // ✅ Shift Management: Notes and Reports
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      report_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      report_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      report_submitted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      report_submitted_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "shifts",
      freezeTableName: true,
      timestamps: false, // ✅ table has created_at but not updated_at
      underscored: true,
    }
  );

  return Shift;
};
