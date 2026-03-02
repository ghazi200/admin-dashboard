/**
 * Message Model
 * 
 * Represents an individual message in a conversation
 */

module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define(
    "Message",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      conversation_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      sender_type: {
        type: DataTypes.ENUM("guard", "admin"),
        allowNull: false,
      },
      sender_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      message_type: {
        type: DataTypes.ENUM("text", "image", "file", "system"),
        defaultValue: "text",
      },
      attachment_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      attachment_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      attachment_size: {
        type: DataTypes.INTEGER,
        allowNull: true, // File size in bytes
      },
      attachment_type: {
        type: DataTypes.STRING,
        allowNull: true, // MIME type
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true, // Soft delete
      },
    },
    {
      timestamps: true,
      underscored: true, // Use snake_case for database columns (created_at, updated_at)
      tableName: "messages",
      paranoid: false, // We handle soft delete manually with deleted_at
    }
  );

  return Message;
};
