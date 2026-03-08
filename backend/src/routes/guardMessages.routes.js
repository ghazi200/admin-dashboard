/**
 * Guard Messaging Routes
 * 
 * Endpoints for guards to send/receive messages
 * Base path: /api/guard/messages
 */

const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const logger = require("../../logger");
const authGuard = require("../middleware/authGuard");
const { getGuardMessagingId, getAdminMessagingId, ensureGuardMessagingId } = require("../utils/messagingId");

/** Ensure message JSON has created_at/createdAt as ISO strings for correct client display/sort */
function normalizeMessageDates(msg) {
  if (!msg || typeof msg !== "object") return msg;
  const created = msg.created_at ?? msg.createdAt;
  const iso = created instanceof Date ? created.toISOString() : (created ? new Date(created).toISOString() : null);
  if (iso) {
    msg.created_at = iso;
    msg.createdAt = iso;
  }
  return msg;
}

/**
 * GET /api/guard/messages/conversations
 * List all conversations for the current guard
 */
router.get("/conversations", authGuard, async (req, res) => {
  try {
    const { Conversation, ConversationParticipant, Message, MessageRead } = req.app.locals.models;
    const guardId = req.guard?.id;
    const tenantId = req.guard?.tenant_id;

    if (!guardId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const guardMessagingId = ensureGuardMessagingId(guardId);

    const whereParticipant = { participant_type: "guard", participant_id: guardMessagingId };
    // Show all conversations this guard participates in (no tenant filter), so admin-created groups always appear
    const whereConversation = {};

    const participants = await ConversationParticipant.findAll({
      where: whereParticipant,
      include: [
        {
          model: Conversation,
          as: "conversation",
          where: whereConversation,
          include: [
            { model: ConversationParticipant, as: "participants" },
          ],
        },
      ],
      order: [[{ model: Conversation, as: "conversation" }, "updated_at", "DESC"]],
    });

    const conversationIds = participants.map((p) => p.conversation_id);
    if (conversationIds.length === 0) {
      return res.json({ conversations: [] });
    }

    // Build participant_id (messaging UUID) -> display name for resolving "Unnamed" conversations
    const { Guard, Admin } = req.app.locals.models;
    const participantNameByMessagingId = new Map();
    const guardWhere = tenantId ? { tenant_id: tenantId } : {};
    const guards = await Guard.findAll({ where: guardWhere, attributes: ["id", "name"] });
    guards.forEach((g) => participantNameByMessagingId.set(getGuardMessagingId(g.id), g.name || "Guard"));
    const admins = await Admin.findAll({ attributes: ["id", "name"] });
    admins.forEach((a) => participantNameByMessagingId.set(getAdminMessagingId(a.id), a.name || a.email || "Admin"));

    // Last message per conversation (simple: get recent messages then pick first per conv)
    const recentMessages = await Message.findAll({
      where: { conversation_id: { [Op.in]: conversationIds }, deleted_at: null },
      order: [["created_at", "DESC"]],
      attributes: ["id", "conversation_id", "content", "created_at"],
      raw: true,
    });
    const lastByConv = new Map();
    for (const m of recentMessages) {
      if (!lastByConv.has(m.conversation_id)) {
        lastByConv.set(m.conversation_id, { content: m.content, createdAt: m.created_at });
      }
    }

    // Unread: messages not from guard that this guard hasn't read
    const fromOthers = await Message.findAll({
      where: {
        conversation_id: { [Op.in]: conversationIds },
        deleted_at: null,
        [Op.or]: [
          { sender_type: { [Op.ne]: "guard" } },
          { sender_id: { [Op.ne]: guardMessagingId } },
        ],
      },
      attributes: ["id", "conversation_id"],
      raw: true,
    });
    const messageIds = fromOthers.map((m) => m.id);
    let readSet = new Set();
    if (messageIds.length > 0) {
      const readByGuard = await MessageRead.findAll({
        where: {
          message_id: { [Op.in]: messageIds },
          reader_type: "guard",
          reader_id: guardMessagingId,
        },
        attributes: ["message_id"],
        raw: true,
      });
      readSet = new Set(readByGuard.map((r) => r.message_id));
    }
    const unreadByConv = new Map();
    for (const m of fromOthers) {
      if (!readSet.has(m.id)) {
        unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) || 0) + 1);
      }
    }

    const conversations = participants.map((participant) => {
      const conv = participant.conversation.toJSON();
      const lastMessage = lastByConv.get(conv.id) || null;
      const unreadCount = unreadByConv.get(conv.id) || 0;
      let displayName = (conv.name && String(conv.name).trim()) || null;
      if (!displayName && Array.isArray(conv.participants)) {
        const otherNames = conv.participants
          .filter((p) => p.participant_id !== guardMessagingId)
          .map((p) => participantNameByMessagingId.get(p.participant_id))
          .filter(Boolean);
        if (otherNames.length > 0) displayName = otherNames.join(", ");
      }
      return {
        id: conv.id,
        type: conv.type,
        name: displayName || conv.name || "Unnamed",
        lastMessage,
        unreadCount,
        participants: conv.participants || [],
        updatedAt: conv.updated_at,
      };
    });

    res.json({ conversations });
  } catch (error) {
    logger.error("Error fetching guard conversations:", error);
    res.status(500).json({ message: "Failed to load conversations", error: error.message });
  }
});

/**
 * GET /api/guard/messages/conversations/:conversationId
 * Get conversation details
 */
router.get("/conversations/:conversationId", authGuard, async (req, res) => {
  try {
    const { Conversation, ConversationParticipant } = req.app.locals.models;
    const guardId = req.guard?.id;
    const conversationId = req.params.conversationId;
    const guardMessagingId = ensureGuardMessagingId(guardId);

    // Verify guard is a participant
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "guard",
        participant_id: guardMessagingId,
      },
    });

    if (!participant) {
      return res.status(403).json({ message: "Access denied" });
    }

    const conversation = await Conversation.findByPk(conversationId, {
      include: [
        {
          model: ConversationParticipant,
          as: "participants",
        },
      ],
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    res.json({ conversation: conversation.toJSON() });
  } catch (error) {
    logger.error("Error fetching conversation:", error);
    res.status(500).json({ message: "Failed to load conversation", error: error.message });
  }
});

/**
 * DELETE /api/guard/messages/conversations/:conversationId
 * Leave conversation: remove the guard from participants so they no longer see it.
 */
router.delete("/conversations/:conversationId", authGuard, async (req, res) => {
  try {
    const { ConversationParticipant } = req.app.locals.models;
    const guardId = req.guard?.id;
    const conversationId = (req.params.conversationId || "").trim();
    const guardMessagingId = ensureGuardMessagingId(guardId);

    if (!guardId || !guardMessagingId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "guard",
        participant_id: guardMessagingId,
      },
    });
    if (!participant) {
      return res.status(404).json({ message: "Conversation not found or you have already left" });
    }

    await participant.destroy();
    res.json({ success: true, id: conversationId });
  } catch (error) {
    logger.error("Error leaving conversation (guard):", error);
    res.status(500).json({ message: "Failed to leave conversation", error: error.message });
  }
});

/**
 * GET /api/guard/messages/conversations/:conversationId/messages
 * Get messages in a conversation (paginated)
 */
router.get("/conversations/:conversationId/messages", authGuard, async (req, res) => {
  try {
    const { Message, MessageRead, MessageHidden } = req.app.locals.models;
    const { ConversationParticipant } = req.app.locals.models;
    const guardId = req.guard?.id;
    const conversationId = req.params.conversationId;
    const guardMessagingId = ensureGuardMessagingId(guardId);
    const page = parseInt(req.query.page || "1", 10);
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const offset = (page - 1) * limit;

    // Verify guard is a participant
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "guard",
        participant_id: guardMessagingId,
      },
    });

    if (!participant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Messages hidden "for me" by this guard (hide-from-side-only)
    const hiddenRows = await MessageHidden.findAll({
      where: { reader_type: "guard", reader_id: guardMessagingId },
      attributes: ["message_id"],
      include: [{ model: Message, as: "message", required: true, where: { conversation_id: conversationId }, attributes: [] }],
    });
    const hiddenMessageIds = hiddenRows.map((r) => r.message_id);

    const whereClause = {
      conversation_id: conversationId,
      deleted_at: null,
    };
    if (hiddenMessageIds.length > 0) {
      whereClause.id = { [Op.notIn]: hiddenMessageIds };
    }

    // Get messages
    const { count, rows: messages } = await Message.findAndCountAll({
      where: whereClause,
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    // Get read receipts for these messages
    const messageIds = messages.map((m) => m.id);
    let readSet = new Set();
    if (messageIds.length > 0) {
      const reads = await MessageRead.findAll({
        where: {
          message_id: { [Op.in]: messageIds },
          reader_type: "guard",
          reader_id: guardMessagingId,
        },
      });
      readSet = new Set(reads.map((r) => r.message_id));
    }

    const messagesWithReads = messages.map((message) => {
      const json = message.toJSON();
      const out = {
        ...json,
        sender_type: json.sender_type === "guard" ? "guard" : (json.sender_type || "admin"),
        read: readSet.has(message.id),
      };
      return normalizeMessageDates(out);
    });

    res.json({
      messages: messagesWithReads.reverse(), // Reverse to show oldest first
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    logger.error("Error fetching messages:", error);
    res.status(500).json({ message: "Failed to load messages", error: error.message });
  }
});

/**
 * POST /api/guard/messages/conversations/:conversationId/messages
 * Send a new message
 */
router.post("/conversations/:conversationId/messages", authGuard, async (req, res) => {
  try {
    const { Message, Conversation, ConversationParticipant } = req.app.locals.models;
    const guardId = req.guard?.id;
    const conversationId = req.params.conversationId;
    const guardMessagingId = ensureGuardMessagingId(guardId);
    const content = (req.body?.content ?? req.body?.message ?? "").trim();
    const { messageType = "text", attachmentUrl, attachmentName, attachmentSize, attachmentType } = req.body || {};

    if (!content) {
      return res.status(400).json({ message: "Message content is required" });
    }

    // Verify guard is a participant
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "guard",
        participant_id: guardMessagingId,
      },
    });

    if (!participant) {
      logger.warn("[guard messages] 403: guard not participant", { conversationId, guardId: req.guard?.id, guardMessagingId });
      return res.status(403).json({
        message: "Access denied. You are not in this conversation. An admin must add you to the group first.",
      });
    }

    // Create message
    const message = await Message.create({
      conversation_id: conversationId,
      sender_type: "guard",
      sender_id: guardMessagingId,
      content,
      message_type: messageType,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      attachment_size: attachmentSize,
      attachment_type: attachmentType,
    });

    // Update conversation updated_at
    await Conversation.update(
      { updated_at: new Date() },
      { where: { id: conversationId } }
    );

    const participants = await ConversationParticipant.findAll({
      where: { conversation_id: conversationId },
    });

    const messageData = normalizeMessageDates(message.toJSON());
    const emitToRealtime = req.app.locals.emitToRealtime;
    if (emitToRealtime) {
      const rooms = participants.map((p) =>
        p.participant_type === "guard" ? `guard:${p.participant_id}` : `admin:${p.participant_id}`
      );
      emitToRealtime(req.app, rooms, "message:new", {
        conversationId,
        message: messageData,
      }).catch(() => {});
    }

    res.status(201).json({ message: messageData });
  } catch (error) {
    logger.error("Error sending message (guard):", error);
    res.status(500).json({ message: "Failed to send message", error: error.message });
  }
});

/** Normalize UUID for comparison */
function normalizeUuid(val) {
  if (val == null) return "";
  const s = typeof val === "string" ? val : (val?.toString && val.toString()) || String(val);
  return s.toLowerCase().replace(/\s/g, "").trim();
}

/**
 * DELETE /api/guard/messages/conversations/:conversationId/messages/:messageId
 * - Own message: soft-delete for everyone (deleted_at).
 * - Admin message: hide from this guard's view only (MessageHidden); admin still sees it.
 */
router.delete("/conversations/:conversationId/messages/:messageId", authGuard, async (req, res) => {
  try {
    const { Message, MessageHidden, ConversationParticipant } = req.app.locals.models;
    const guardId = req.guard?.id;
    const conversationId = (req.params.conversationId || "").trim();
    const messageId = (req.params.messageId || "").trim();
    const guardMessagingId = ensureGuardMessagingId(guardId);

    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "guard",
        participant_id: guardMessagingId,
      },
    });
    if (!participant) {
      return res.status(403).json({ message: "Access denied" });
    }

    const message = await Message.findOne({
      where: {
        id: messageId,
        conversation_id: conversationId,
        deleted_at: null,
      },
    });
    if (!message) {
      return res.status(404).json({ message: "Message not found or already deleted" });
    }

    const senderIdNorm = normalizeUuid(message.sender_id);
    const guardIdNorm = normalizeUuid(guardMessagingId);
    const isOwnMessage = message.sender_type === "guard" && senderIdNorm === guardIdNorm;

    if (isOwnMessage) {
      await message.update({ deleted_at: new Date() });
    } else {
      // Admin (or other) message: hide only for this guard
      await MessageHidden.findOrCreate({
        where: {
          message_id: messageId,
          reader_type: "guard",
          reader_id: guardMessagingId,
        },
        defaults: {
          message_id: messageId,
          reader_type: "guard",
          reader_id: guardMessagingId,
        },
      });
    }
    res.json({ success: true, id: messageId });
  } catch (error) {
    logger.error("Error deleting message (guard):", error);
    res.status(500).json({ message: "Failed to delete message", error: error.message });
  }
});

/**
 * POST /api/guard/messages/conversations/:conversationId/read
 * Mark conversation as read
 */
router.post("/conversations/:conversationId/read", authGuard, async (req, res) => {
  try {
    const { Message, MessageRead, ConversationParticipant } = req.app.locals.models;
    const guardId = req.guard?.id;
    const conversationId = req.params.conversationId;
    const guardMessagingId = ensureGuardMessagingId(guardId);
    const { lastMessageId } = req.body;

    // Verify guard is a participant
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "guard",
        participant_id: guardMessagingId,
      },
    });

    if (!participant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get all unread messages in this conversation (from others, not this guard)
    const unreadMessages = await Message.findAll({
      where: {
        conversation_id: conversationId,
        deleted_at: null,
        [Op.or]: [
          { sender_type: { [Op.ne]: "guard" } },
          { sender_id: { [Op.ne]: guardMessagingId } },
        ],
      },
      order: [["created_at", "ASC"]],
    });

    const readRows = await MessageRead.findAll({
      where: {
        message_id: { [Op.in]: unreadMessages.map((m) => m.id) },
        reader_type: "guard",
        reader_id: guardMessagingId,
      },
      attributes: ["message_id"],
    });
    const readIds = new Set(readRows.map((r) => r.message_id));
    const toMark = lastMessageId
      ? (() => {
          const last = unreadMessages.find((m) => m.id === lastMessageId);
          if (!last) return unreadMessages.filter((m) => !readIds.has(m.id));
          const cutoff = new Date(last.created_at).getTime();
          return unreadMessages.filter((m) => !readIds.has(m.id) && new Date(m.created_at).getTime() <= cutoff);
        })()
      : unreadMessages.filter((m) => !readIds.has(m.id));

    for (const message of toMark) {
      await MessageRead.findOrCreate({
        where: {
          message_id: message.id,
          reader_type: "guard",
          reader_id: guardMessagingId,
        },
        defaults: {
          message_id: message.id,
          reader_type: "guard",
          reader_id: guardMessagingId,
          read_at: new Date(),
        },
      });
    }

    // Update participant's last_read_at
    await ConversationParticipant.update(
      { last_read_at: new Date() },
      {
        where: {
          conversation_id: conversationId,
          participant_type: "guard",
          participant_id: guardMessagingId,
        },
      }
    );

    res.json({ success: true });
  } catch (error) {
    logger.error("Error marking conversation as read:", error);
    res.status(500).json({ message: "Failed to mark as read", error: error.message });
  }
});

/**
 * POST /api/guard/messages/conversations
 * Create a new direct message conversation with an admin
 */
router.post("/conversations", authGuard, async (req, res) => {
  try {
    const { Conversation, ConversationParticipant } = req.app.locals.models;
    const guardId = req.guard?.id;
    const tenantId = req.guard?.tenant_id;
    const guardMessagingId = ensureGuardMessagingId(guardId);
    const { recipientType = "admin", recipientId } = req.body;

    if (!recipientId) {
      return res.status(400).json({ message: "recipientId is required" });
    }

    if (recipientType !== "admin") {
      return res.status(400).json({ message: "Guards can only message admins" });
    }

    // Check if conversation already exists
    const existingConversations = await Conversation.findAll({
      where: {
        tenant_id: tenantId,
        type: "direct",
      },
      include: [
        {
          model: ConversationParticipant,
          as: "participants",
          where: {
            participant_type: "guard",
            participant_id: guardMessagingId,
          },
        },
      ],
    });

    // Check if there's already a direct conversation with this admin
    for (const conv of existingConversations) {
      const participants = await ConversationParticipant.findAll({
        where: { conversation_id: conv.id },
      });
      const hasAdmin = participants.some(
        (p) => p.participant_type === "admin" && p.participant_id === recipientId
      );
      if (hasAdmin && participants.length === 2) {
        return res.json({ conversation: conv.toJSON() });
      }
    }

    // Create new conversation
    const conversation = await Conversation.create({
      tenant_id: tenantId,
      type: "direct",
      created_by_type: "guard",
      created_by_id: guardMessagingId,
    });

    // Add participants
    await ConversationParticipant.create({
      conversation_id: conversation.id,
      participant_type: "guard",
      participant_id: guardMessagingId,
    });

    await ConversationParticipant.create({
      conversation_id: conversation.id,
      participant_type: "admin",
      participant_id: recipientId,
    });

    const fullConversation = await Conversation.findByPk(conversation.id, {
      include: [
        {
          model: ConversationParticipant,
          as: "participants",
        },
      ],
    });

    res.status(201).json({ conversation: fullConversation.toJSON() });
  } catch (error) {
    logger.error("Error creating conversation:", error);
    res.status(500).json({ message: "Failed to create conversation", error: error.message });
  }
});

module.exports = router;
