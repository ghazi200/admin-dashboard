/**
 * Conversation Model
 * 
 * Represents a conversation (direct message or group chat)
 */

module.exports = (sequelize, DataTypes) => {
  const Conversation = sequelize.define(
    "Conversation",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      tenant_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM("direct", "group"),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true, // NULL for direct messages, name for groups
      },
      created_by_type: {
        type: DataTypes.ENUM("guard", "admin"),
        allowNull: true,
      },
      created_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      shift_id: {
        type: DataTypes.UUID,
        allowNull: true, // For shift-based group chats
      },
      location: {
        type: DataTypes.STRING,
        allowNull: true, // For location-based group chats
      },
    },
    {
      timestamps: true,
      underscored: true, // Use snake_case for database columns (created_at, updated_at)
      tableName: "conversations",
    }
  );

  return Conversation;
};
