/**
 * Admin Messaging Routes
 * 
 * Endpoints for admins to send/receive messages and manage conversations
 * Base path: /api/admin/messages
 */

const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const authAdmin = require("../middleware/authAdmin");
const {
  getAdminMessagingId,
  getGuardMessagingId,
  ensureAdminMessagingId,
} = require("../utils/messagingId");

/** Ensure message JSON has created_at/createdAt as ISO strings (UTC with Z) for correct client display/sort */
function normalizeMessageDates(msg) {
  if (!msg || typeof msg !== "object") return msg;
  const created = msg.created_at ?? msg.createdAt;
  const iso =
    created instanceof Date
      ? created.toISOString()
      : created
        ? new Date(created).toISOString()
        : null;
  if (iso) {
    msg.created_at = iso;
    msg.createdAt = iso;
  }
  return msg;
}

/** Build response message object with guaranteed ISO timestamps (same shape as test expects) */
function toMessageResponse(message) {
  const json = message.toJSON ? message.toJSON() : message;
  const out = { ...json };
  return normalizeMessageDates(out);
}

/**
 * GET /api/admin/messages/conversations
 * List all conversations for the current admin
 */
router.get("/conversations", authAdmin, async (req, res) => {
  try {
    const { Conversation, ConversationParticipant, Message } = req.app.locals.models;
    let adminId = req.admin?.id;
    const tenantId = req.admin?.tenant_id;
    const { type, search } = req.query;

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const adminMessagingId = ensureAdminMessagingId(adminId);

    // Build where clause
    const where = {};
    if (tenantId) {
      where.tenant_id = tenantId;
    }
    if (type && (type === "direct" || type === "group")) {
      where.type = type;
    }

    // Find all conversations where admin is a participant
    const participants = await ConversationParticipant.findAll({
      where: {
        participant_type: "admin",
        participant_id: adminMessagingId,
      },
      include: [
        {
          model: Conversation,
          as: "conversation",
          where,
          include: [
            {
              model: ConversationParticipant,
              as: "participants",
            },
          ],
        },
      ],
      order: [[{ model: Conversation, as: "conversation" }, "updated_at", "DESC"]],
    });

    // Filter by search if provided
    let filteredParticipants = participants;
    if (search) {
      filteredParticipants = participants.filter((p) => {
        const conv = p.conversation;
        const searchLower = search.toLowerCase();
        return (
          conv.name?.toLowerCase().includes(searchLower) ||
          conv.location?.toLowerCase().includes(searchLower) ||
          conv.participants.some((part) => {
            // You might want to join with Guard/Admin tables to get names
            return part.participant_id.toString().includes(searchLower);
          })
        );
      });
    }

    // Get last message for each conversation
    const conversationIds = filteredParticipants.map((p) => p.conversation_id);
    
    // Get the most recent message for each conversation
    const lastMessagesData = await Message.findAll({
      where: {
        conversation_id: { [Op.in]: conversationIds },
        deleted_at: null,
      },
      order: [["created_at", "DESC"]],
      attributes: ["conversation_id", "content", "created_at"],
    });

    // Group by conversation_id and get the first (most recent) for each
    const lastMessagesMap = new Map();
    lastMessagesData.forEach((msg) => {
      if (!lastMessagesMap.has(msg.conversation_id)) {
        lastMessagesMap.set(msg.conversation_id, {
          conversation_id: msg.conversation_id,
          content: msg.content,
          created_at: msg.created_at,
        });
      }
    });
    const lastMessages = Array.from(lastMessagesMap.values());

    // Get unread counts - count messages not read by this admin
    const { MessageRead } = req.app.locals.models;
    
    // Get all messages in these conversations that weren't sent by this admin
    const allMessages = await Message.findAll({
      where: {
        conversation_id: { [Op.in]: conversationIds },
        deleted_at: null,
        [Op.or]: [
          { sender_type: { [Op.ne]: "admin" } },
          { sender_id: { [Op.ne]: adminMessagingId } },
        ],
      },
      attributes: ["id", "conversation_id"],
    });

    // Get all read receipts for these messages by this admin
    const messageIds = allMessages.map((m) => m.id);
    const readReceipts = await MessageRead.findAll({
      where: {
        message_id: { [Op.in]: messageIds },
        reader_type: "admin",
        reader_id: adminMessagingId,
      },
      attributes: ["message_id"],
    });

    const readMessageIds = new Set(readReceipts.map((r) => r.message_id));

    // Count unread per conversation
    const unreadCountsMap = new Map();
    allMessages.forEach((msg) => {
      if (!readMessageIds.has(msg.id)) {
        const count = unreadCountsMap.get(msg.conversation_id) || 0;
        unreadCountsMap.set(msg.conversation_id, count + 1);
      }
    });

    const unreadCounts = Array.from(unreadCountsMap.entries()).map(([conversation_id, unread_count]) => ({
      conversation_id,
      unread_count,
    }));

    const conversations = filteredParticipants.map((participant) => {
      const conv = participant.conversation.toJSON();
      const lastMessage = lastMessages.find((m) => m.conversation_id === conv.id);
      const unread = unreadCounts.find((u) => u.conversation_id === conv.id) || { unread_count: 0 };

      return {
        id: conv.id,
        type: conv.type,
        name: conv.name,
        location: conv.location,
        shift_id: conv.shift_id,
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          createdAt: lastMessage.created_at,
        } : null,
        unreadCount: parseInt(unread.unread_count || 0, 10),
        participants: conv.participants || [],
        updatedAt: conv.updated_at,
      };
    });

    res.json({ conversations });
  } catch (error) {
    console.error("Error fetching admin conversations:", error);
    res.status(500).json({ message: "Failed to load conversations", error: error.message });
  }
});

/**
 * GET /api/admin/messages/conversations/:conversationId
 * Get conversation details
 */
router.get("/conversations/:conversationId", authAdmin, async (req, res) => {
  try {
    const { Conversation, ConversationParticipant } = req.app.locals.models;
    const adminId = req.admin?.id;
    const conversationId = req.params.conversationId;
    const adminMessagingId = ensureAdminMessagingId(adminId);

    // Verify admin is a participant
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "admin",
        participant_id: adminMessagingId,
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

    const json = conversation.toJSON();
    const participants = json.participants || [];
    const norm = (id) => (id != null ? String(id).toLowerCase().trim() : "");

    if (participants.length > 0) {
      const { Guard, Admin } = req.app.locals.models;
      const tenantId = conversation.tenant_id;
      for (const p of participants) {
        const pId = norm(p.participant_id);
        if (p.participant_type === "guard") {
          let guards = await Guard.findAll({ where: tenantId ? { tenant_id: tenantId } : {}, attributes: ["id", "name", "email"] });
          if (guards.length === 0 && tenantId) {
            guards = await Guard.findAll({ attributes: ["id", "name", "email"] });
          }
          for (const g of guards) {
            const gId = g.id != null ? String(g.id) : "";
            const guardMessagingId = getGuardMessagingId(g.id);
            if (norm(guardMessagingId) === pId || norm(gId) === pId) {
              p.display_name = (g.name && String(g.name).trim()) || (g.email && String(g.email).trim()) || "Guard";
              break;
            }
          }
          if (!p.display_name) p.display_name = "Guard";
        } else if (p.participant_type === "admin") {
          const admins = await Admin.findAll({ attributes: ["id", "name", "email"] });
          for (const a of admins) {
            const adminMessagingId = getAdminMessagingId(a.id);
            if (norm(adminMessagingId) === pId || norm(a.id) === pId) {
              p.display_name = a.name || a.email || "Admin";
              break;
            }
          }
          if (!p.display_name) p.display_name = "Admin";
        }
      }
      json.participants = participants;
    }

    res.json({ conversation: json });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ message: "Failed to load conversation", error: error.message });
  }
});

/**
 * DELETE /api/admin/messages/conversations/:conversationId
 * Delete a conversation (admin must be participant). Deletes messages, reads, hidden, participants, then conversation.
 */
router.delete("/conversations/:conversationId", authAdmin, async (req, res) => {
  try {
    const { Message, MessageRead, MessageHidden, ConversationParticipant, Conversation } = req.app.locals.models;
    const adminId = req.admin?.id;
    const conversationId = (req.params.conversationId || "").trim();
    const adminMessagingId = ensureAdminMessagingId(adminId);

    if (!adminId || !adminMessagingId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "admin",
        participant_id: adminMessagingId,
      },
    });
    if (!participant) {
      return res.status(403).json({ message: "Access denied. You are not in this conversation." });
    }

    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Delete in dependency order so no FK violations (message_reads, message_hidden -> messages -> conversation_participants -> conversation)
    const messages = await Message.findAll({ where: { conversation_id: conversationId }, attributes: ["id"] });
    const messageIds = messages.map((m) => m.id);
    if (messageIds.length > 0) {
      await MessageRead.destroy({ where: { message_id: { [Op.in]: messageIds } } }).catch(() => {});
      if (MessageHidden) {
        await MessageHidden.destroy({ where: { message_id: { [Op.in]: messageIds } } }).catch(() => {});
      }
    }
    await Message.destroy({ where: { conversation_id: conversationId } });
    await ConversationParticipant.destroy({ where: { conversation_id: conversationId } });
    await conversation.destroy();

    res.json({ success: true, id: conversationId });
  } catch (error) {
    console.error("Error deleting conversation (admin):", error);
    res.status(500).json({ message: "Failed to delete conversation", error: error.message });
  }
});

/**
 * GET /api/admin/messages/conversations/:conversationId/messages
 * Get messages in a conversation (paginated)
 */
router.get("/conversations/:conversationId/messages", authAdmin, async (req, res) => {
  try {
    const { Message, MessageRead, ConversationParticipant } = req.app.locals.models;
    const adminId = req.admin?.id;
    const conversationId = req.params.conversationId;
    const adminMessagingId = ensureAdminMessagingId(adminId);
    const page = parseInt(req.query.page || "1", 10);
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const offset = (page - 1) * limit;

    // Verify admin is a participant
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "admin",
        participant_id: adminMessagingId,
      },
    });

    if (!participant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get messages
    const { count, rows: messages } = await Message.findAndCountAll({
      where: {
        conversation_id: conversationId,
        deleted_at: null,
      },
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
          reader_type: "admin",
          reader_id: adminMessagingId,
        },
      });
      readSet = new Set(reads.map((r) => r.message_id));
    }

    const messagesWithReads = messages.map((message) => {
      const json = message.toJSON();
      return normalizeMessageDates({ ...json, read: readSet.has(message.id) });
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
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Failed to load messages", error: error.message });
  }
});

/**
 * POST /api/admin/messages/conversations/:conversationId/messages
 * Send a new message
 */
router.post("/conversations/:conversationId/messages", authAdmin, async (req, res) => {
  try {
    const { Message, Conversation, ConversationParticipant } = req.app.locals.models;
    const adminId = req.admin?.id;
    const conversationId = req.params.conversationId;
    const adminMessagingId = ensureAdminMessagingId(adminId);
    const content = (req.body?.content ?? req.body?.message ?? "").trim();
    const { messageType = "text", attachmentUrl, attachmentName, attachmentSize, attachmentType } = req.body || {};

    if (!content) {
      return res.status(400).json({ message: "Message content is required" });
    }

    // Verify admin is a participant
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "admin",
        participant_id: adminMessagingId,
      },
    });

    if (!participant) {
      console.warn("[admin messages] 403: admin not participant", { conversationId, adminId, adminMessagingId });
      return res.status(403).json({
        message: "Access denied. You are not in this conversation. Try opening a conversation you created or were added to.",
      });
    }

    // Create message
    const message = await Message.create({
      conversation_id: conversationId,
      sender_type: "admin",
      sender_id: adminMessagingId,
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

    const messageData = toMessageResponse(message);
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

    res.status(201).json({ message: messageData, id: messageData.id });
  } catch (error) {
    console.error("Error sending message (admin):", error);
    res.status(500).json({ message: "Failed to send message", error: error.message });
  }
});

/**
 * DELETE /api/admin/messages/conversations/:conversationId/messages/:messageId
 * Soft-delete a message (only the sender can delete their own message)
 */
/** Normalize UUID for comparison and DB lookup (Sequelize/Postgres may expect consistent format) */
function normalizeUuid(val) {
  if (val == null) return "";
  const s = typeof val === "string" ? val : (val?.toString && val.toString()) || String(val);
  return s.toLowerCase().replace(/\s/g, "").trim();
}

router.delete("/conversations/:conversationId/messages/:messageId", authAdmin, async (req, res) => {
  try {
    const { Message, ConversationParticipant } = req.app.locals.models;
    const adminId = req.admin?.id;
    const conversationId = (req.params.conversationId || "").trim();
    const messageId = (req.params.messageId || "").trim();
    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const adminMessagingId = ensureAdminMessagingId(adminId);
    if (!adminMessagingId) {
      return res.status(400).json({ message: "Invalid admin context" });
    }

    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "admin",
        participant_id: adminMessagingId,
      },
    });
    if (!participant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Use normalized UUIDs so Postgres/Sequelize match (case-insensitive)
    const messageIdNorm = normalizeUuid(messageId);
    const conversationIdNorm = normalizeUuid(conversationId);
    if (!messageIdNorm || messageIdNorm.length < 30) {
      return res.status(400).json({ message: "Invalid message id" });
    }

    const message = await Message.findOne({
      where: {
        id: messageIdNorm,
        conversation_id: conversationIdNorm,
        deleted_at: null,
      },
    });
    if (!message) {
      if (process.env.DEBUG_STARTUP) {
        console.log("[admin messages] DELETE 404:", { conversationId: conversationIdNorm, messageId: messageIdNorm });
      }
      return res.status(404).json({ message: "Message not found or already deleted" });
    }
    // Admin can delete any message in the conversation (own or guard's)
    await message.update({ deleted_at: new Date() });
    res.json({ success: true, id: messageId });
  } catch (error) {
    console.error("Error deleting message (admin):", error);
    res.status(500).json({ message: "Failed to delete message", error: error.message });
  }
});

/**
 * POST /api/admin/messages/conversations/:conversationId/read
 * Mark conversation as read
 */
router.post("/conversations/:conversationId/read", authAdmin, async (req, res) => {
  try {
    const { Message, MessageRead, ConversationParticipant } = req.app.locals.models;
    const adminId = req.admin?.id;
    const conversationId = req.params.conversationId;
    const adminMessagingId = ensureAdminMessagingId(adminId);
    const { lastMessageId } = req.body;

    // Verify admin is a participant
    const participant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "admin",
        participant_id: adminMessagingId,
      },
    });

    if (!participant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get all unread messages in this conversation
    const unreadMessages = await Message.findAll({
      where: {
        conversation_id: conversationId,
        deleted_at: null,
        sender_type: { [Op.ne]: "admin" },
        sender_id: { [Op.ne]: adminMessagingId },
      },
      include: [
        {
          model: MessageRead,
          as: "reads",
          where: {
            reader_type: "admin",
            reader_id: adminMessagingId,
          },
          required: false,
        },
      ],
    });

    // Mark all unread messages as read
    const messagesToMark = lastMessageId
      ? unreadMessages.filter((m) => m.id <= lastMessageId)
      : unreadMessages;

    for (const message of messagesToMark) {
      await MessageRead.findOrCreate({
        where: {
          message_id: message.id,
          reader_type: "admin",
          reader_id: adminMessagingId,
        },
        defaults: {
          message_id: message.id,
          reader_type: "admin",
          reader_id: adminMessagingId,
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
          participant_type: "admin",
          participant_id: adminMessagingId,
        },
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking conversation as read:", error);
    res.status(500).json({ message: "Failed to mark as read", error: error.message });
  }
});

/**
 * POST /api/admin/messages/conversations/group
 * Create a new group chat
 */
router.post("/conversations/group", authAdmin, async (req, res) => {
  try {
    const { Conversation, ConversationParticipant, Shift } = req.app.locals.models;
    const adminId = req.admin?.id;
    const tenantId = req.admin?.tenant_id;
    const { name, participantIds = [], shiftId, location } = req.body;

    if (!adminId) {
      return res.status(401).json({ message: "Unauthorized. Admin ID missing." });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Group name is required" });
    }
    // Conversation model requires tenant_id (allowNull: false)
    if (tenantId == null || tenantId === "") {
      return res.status(400).json({
        message: "A tenant is required to create a group conversation. Your account may not be linked to a tenant.",
      });
    }

    const adminMessagingId = ensureAdminMessagingId(adminId);

    const conversation = await Conversation.create({
      tenant_id: tenantId,
      type: "group",
      name: name.trim(),
      created_by_type: "admin",
      created_by_id: adminMessagingId,
      shift_id: shiftId || null,
      location: location || null,
    });

    // Add admin as participant
    await ConversationParticipant.create({
      conversation_id: conversation.id,
      participant_type: "admin",
      participant_id: adminMessagingId,
    });

    // Add other participants (participantIds from frontend are guard UUIDs from listGuards; Admin.id is integer so never pass UUID to Admin.findByPk)
    const { Guard, Admin } = req.app.locals.models;
    const looksLikeUuid = (id) => typeof id === "string" && id.length === 36 && id.includes("-");

    for (const participantId of participantIds) {
      if (looksLikeUuid(participantId)) {
        const guard = await Guard.findByPk(participantId);
        if (guard) {
          const guardMessagingId = getGuardMessagingId(participantId);
          await ConversationParticipant.create({
            conversation_id: conversation.id,
            participant_type: "guard",
            participant_id: guardMessagingId,
          });
        }
        continue;
      }
      const admin = await Admin.findByPk(participantId);
      if (admin) {
        const adminMessagingIdForUser = getAdminMessagingId(participantId);
        await ConversationParticipant.create({
          conversation_id: conversation.id,
          participant_type: "admin",
          participant_id: adminMessagingIdForUser,
        });
      }
    }

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
    const sequelizeError = error?.errors?.[0] || error?.parent || error?.original;
    const detail = sequelizeError?.message || error?.message || String(error);
    const isFk = /foreign key|violates foreign key|tenant_id|tenants/i.test(detail);
    const isConstraint = /constraint|unique|violates/i.test(detail);
    console.error("Error creating group conversation:", detail);
    if (sequelizeError) console.error("  Sequelize detail:", sequelizeError);

    let message = "Failed to create group conversation.";
    if (isFk && /tenant/i.test(detail)) {
      message = "Your account's tenant is not found in the system. Please contact support or use an account linked to a valid tenant.";
    } else if (detail && detail.length < 200) {
      message = detail;
    }
    res.status(isConstraint || isFk ? 400 : 500).json({
      message,
      error: detail,
    });
  }
});

/**
 * POST /api/admin/messages/conversations/:conversationId/participants
 * Add participants to a group
 */
router.post("/conversations/:conversationId/participants", authAdmin, async (req, res) => {
  try {
    const { ConversationParticipant, Conversation, Guard, Admin } = req.app.locals.models;
    const adminId = req.admin?.id;
    const conversationId = req.params.conversationId;
    const adminMessagingId = ensureAdminMessagingId(adminId);
    const { participantIds } = req.body;

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ message: "participantIds array is required" });
    }

    // Verify admin is a participant and conversation is a group
    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Can only add participants to group conversations" });
    }

    const adminParticipant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "admin",
        participant_id: adminMessagingId,
      },
    });

    if (!adminParticipant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Add participants (participantIds from frontend are guard UUIDs; Admin.id is integer so never pass UUID to Admin.findByPk)
    const looksLikeUuid = (id) => typeof id === "string" && id.length === 36 && id.includes("-");
    const added = [];

    for (const participantId of participantIds) {
      if (looksLikeUuid(participantId)) {
        const guard = await Guard.findByPk(participantId);
        if (!guard) continue;
        const guardMessagingId = getGuardMessagingId(participantId);
        const existing = await ConversationParticipant.findOne({
          where: { conversation_id: conversationId, participant_id: guardMessagingId },
        });
        if (existing) continue;
        await ConversationParticipant.create({
          conversation_id: conversationId,
          participant_type: "guard",
          participant_id: guardMessagingId,
        });
        added.push({ id: participantId, type: "guard" });
        continue;
      }

      const adminUser = await Admin.findByPk(participantId);
      if (!adminUser) continue;
      const adminMessagingIdForUser = getAdminMessagingId(participantId);
      const existing = await ConversationParticipant.findOne({
        where: { conversation_id: conversationId, participant_id: adminMessagingIdForUser },
      });
      if (existing) continue;
      await ConversationParticipant.create({
        conversation_id: conversationId,
        participant_type: "admin",
        participant_id: adminMessagingIdForUser,
      });
      added.push({ id: participantId, type: "admin" });
    }

    res.json({ added, message: `Added ${added.length} participant(s)` });
  } catch (error) {
    console.error("Error adding participants:", error);
    res.status(500).json({ message: "Failed to add participants", error: error.message });
  }
});

/**
 * DELETE /api/admin/messages/conversations/:conversationId/participants/:participantId
 * Remove participant from group
 */
router.delete("/conversations/:conversationId/participants/:participantId", authAdmin, async (req, res) => {
  try {
    const { ConversationParticipant, Conversation } = req.app.locals.models;
    const adminId = req.admin?.id;
    const conversationId = req.params.conversationId;
    const participantId = req.params.participantId;
    const adminMessagingId = ensureAdminMessagingId(adminId);

    // Verify admin is a participant and conversation is a group
    const conversation = await Conversation.findByPk(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (conversation.type !== "group") {
      return res.status(400).json({ message: "Can only remove participants from group conversations" });
    }

    const adminParticipant = await ConversationParticipant.findOne({
      where: {
        conversation_id: conversationId,
        participant_type: "admin",
        participant_id: adminMessagingId,
      },
    });

    if (!adminParticipant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Don't allow removing the admin who created it (unless super_admin)
    if ((participantId === adminId || participantId === adminMessagingId) && req.admin?.role !== "super_admin") {
      return res.status(400).json({ message: "Cannot remove yourself from group" });
    }

    // Remove participant
    await ConversationParticipant.destroy({
      where: {
        conversation_id: conversationId,
        participant_id: participantId,
      },
    });

    res.json({ success: true, message: "Participant removed" });
  } catch (error) {
    console.error("Error removing participant:", error);
    res.status(500).json({ message: "Failed to remove participant", error: error.message });
  }
});

module.exports = router;
