/**
 * MessageRead Model
 * 
 * Tracks read receipts (who read which messages)
 */

module.exports = (sequelize, DataTypes) => {
  const MessageRead = sequelize.define(
    "MessageRead",
    {
      message_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      reader_type: {
        type: DataTypes.ENUM("guard", "admin"),
        allowNull: false,
      },
      reader_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      read_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      timestamps: false, // We use read_at instead
      tableName: "message_reads",
      // Note: Unique constraint (message_id, reader_type, reader_id) 
      // is already defined in the table creation script, so we don't define it here
      // to avoid "index already exists" errors
      indexes: [
        // These indexes are already created by the migration script
        // Defining them here would cause duplicate index errors
      ],
    }
  );

  return MessageRead;
};
