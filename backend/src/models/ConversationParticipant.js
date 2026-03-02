/**
 * ConversationParticipant Model
 * 
 * Links users (guards/admins) to conversations (many-to-many)
 */

module.exports = (sequelize, DataTypes) => {
  const ConversationParticipant = sequelize.define(
    "ConversationParticipant",
    {
      conversation_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      participant_type: {
        type: DataTypes.ENUM("guard", "admin"),
        allowNull: false,
      },
      participant_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      last_read_at: {
        type: DataTypes.DATE,
        allowNull: true, // For read receipts
      },
      muted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    {
      timestamps: true,
      underscored: true, // Use snake_case for database columns
      createdAt: "joined_at",
      updatedAt: false,
      tableName: "conversation_participants",
      // Note: Unique constraint (conversation_id, participant_type, participant_id) 
      // is already defined in the table creation script, so we don't define it here
      // to avoid "index already exists" errors
      indexes: [
        // These indexes are already created by the migration script
        // Defining them here would cause duplicate index errors
      ],
    }
  );

  return ConversationParticipant;
};
