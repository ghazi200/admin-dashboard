/**
 * MessageHidden Model
 *
 * Tracks messages hidden "for me" by a participant (e.g. guard hides an admin message on their side only).
 * The message stays visible for others; only this reader won't see it.
 */

module.exports = (sequelize, DataTypes) => {
  const MessageHidden = sequelize.define(
    "MessageHidden",
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
    },
    {
      timestamps: true,
      underscored: true,
      tableName: "message_hidden",
      indexes: [
        { unique: true, fields: ["message_id", "reader_type", "reader_id"] },
        { fields: ["reader_type", "reader_id"] },
      ],
    }
  );

  return MessageHidden;
};
