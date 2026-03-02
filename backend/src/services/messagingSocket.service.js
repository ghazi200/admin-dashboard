/**
 * Messaging Socket.IO Service
 * 
 * Handles real-time messaging events via Socket.IO
 * - Message delivery
 * - Read receipts
 * - Typing indicators
 * - Online/offline status
 */

const { toParticipantId } = require("../utils/messagingId");

/**
 * Initialize messaging socket handlers
 * @param {Object} io - Socket.IO server instance
 * @param {Object} models - Sequelize models
 */
function initMessagingSocketHandlers(io, models) {
  const { ConversationParticipant, Message, MessageRead } = models;

  io.on("connection", (socket) => {
    // Determine user type (admin or guard) from socket
    const userType = socket.admin ? "admin" : socket.guard ? "guard" : null;
    const userId = socket.admin?.id || socket.guard?.id;

    if (!userType || !userId) return;

    // participant_id in DB is UUID; convert integer admin/guard id to messaging UUID
    const participantId = toParticipantId(userType, userId);

    // Join user-specific room for receiving messages (must use participantId/UUID so
    // admin/guard POST send routes emit to the same room they join)
    const userRoom = `${userType}:${participantId}`;
    socket.join(userRoom);

    // Join all conversations this user is part of
    (async () => {
      try {
        const participants = await ConversationParticipant.findAll({
          where: {
            participant_type: userType,
            participant_id: participantId,
          },
        });

        for (const participant of participants) {
          const conversationRoom = `conversation:${participant.conversation_id}`;
          socket.join(conversationRoom);
        }
      } catch (error) {
        console.error("Error joining conversation rooms:", error);
      }
    })();

    // Handle: Join a conversation room
    socket.on("conversation:join", async (data) => {
      try {
        const { conversationId } = data;

        // Verify user is a participant
        const participant = await ConversationParticipant.findOne({
          where: {
            conversation_id: conversationId,
            participant_type: userType,
            participant_id: participantId,
          },
        });

        if (participant) {
          const conversationRoom = `conversation:${conversationId}`;
          socket.join(conversationRoom);
        } else {
          socket.emit("error", { message: "Not a participant in this conversation" });
        }
      } catch (error) {
        console.error("Error joining conversation:", error);
        socket.emit("error", { message: "Failed to join conversation" });
      }
    });

    // Handle: Leave a conversation room
    socket.on("conversation:leave", (data) => {
      const { conversationId } = data;
      const conversationRoom = `conversation:${conversationId}`;
      socket.leave(conversationRoom);
    });

    // Handle: Typing indicator
    socket.on("typing:start", async (data) => {
      try {
        const { conversationId } = data;

        // Verify user is a participant
        const participant = await ConversationParticipant.findOne({
          where: {
            conversation_id: conversationId,
            participant_type: userType,
            participant_id: participantId,
          },
        });

        if (participant) {
          // Emit to all other participants in the conversation
          const conversationRoom = `conversation:${conversationId}`;
          socket.to(conversationRoom).emit("typing:indicator", {
            conversationId,
            userType,
            userId,
            typing: true,
          });
        }
      } catch (error) {
        console.error("Error handling typing start:", error);
      }
    });

    // Handle: Stop typing indicator
    socket.on("typing:stop", async (data) => {
      try {
        const { conversationId } = data;

        const participant = await ConversationParticipant.findOne({
          where: {
            conversation_id: conversationId,
            participant_type: userType,
            participant_id: participantId,
          },
        });

        if (participant) {
          const conversationRoom = `conversation:${conversationId}`;
          socket.to(conversationRoom).emit("typing:indicator", {
            conversationId,
            userType,
            userId,
            typing: false,
          });
        }
      } catch (error) {
        console.error("Error handling typing stop:", error);
      }
    });

    // Handle: Mark message as read (real-time)
    socket.on("message:read", async (data) => {
      try {
        const { messageId } = data;

        // Create read receipt (reader_id is UUID in DB)
        await MessageRead.findOrCreate({
          where: {
            message_id: messageId,
            reader_type: userType,
            reader_id: participantId,
          },
          defaults: {
            message_id: messageId,
            reader_type: userType,
            reader_id: participantId,
            read_at: new Date(),
          },
        });

        // Notify sender that message was read
        const message = await Message.findByPk(messageId);
        if (message) {
          const senderRoom = `${message.sender_type}:${message.sender_id}`;
          io.to(senderRoom).emit("message:read", {
            messageId,
            readerType: userType,
            readerId: userId,
          });
        }
      } catch (error) {
        console.error("Error marking message as read:", error);
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
    });
  });

}

module.exports = {
  initMessagingSocketHandlers,
};
