/**
 * Guard Messages (guard-ui in this app).
 * Used at /messages/guard (MessagesGuard.jsx). Lists conversations, messages, 3s polling, Delete on every message.
 * Uses guardToken from localStorage; guardMessaging.service.js calls /api/guard/messages on backend (5000).
 */
import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  listConversations,
  getMessages,
  sendMessage,
  deleteMessage,
  markConversationAsRead,
  deleteConversation,
} from "./guardMessaging.service";

const POLL_INTERVAL_MS = 3000;

const styles = {
  layout: { display: "flex", gap: 16, height: "calc(100vh - 120px)", minHeight: 400 },
  sidebar: {
    width: 280,
    display: "flex",
    flexDirection: "column",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fafafa",
    overflow: "hidden",
  },
  list: { flex: 1, overflow: "auto" },
  convItem: {
    padding: "12px 16px",
    borderBottom: "1px solid #eee",
    cursor: "pointer",
  },
  convItemSelected: { background: "#e8f4fd", borderLeft: "3px solid #1890ff" },
  messageArea: { flex: 1, display: "flex", flexDirection: "column", border: "1px solid #eee", borderRadius: 12, background: "#fff", overflow: "hidden" },
  messages: { flex: 1, overflow: "auto", padding: 16 },
  messageBubble: { marginBottom: 8, padding: "8px 12px", borderRadius: 12, maxWidth: "80%" },
  messageBubbleOwn: { marginLeft: "auto", background: "#1890ff", color: "#fff" },
  messageBubbleOther: { marginRight: "auto", background: "#f0f0f0" },
  messageMeta: { fontSize: 11, color: "#888", marginTop: 4 },
  inputRow: { display: "flex", gap: 8, padding: 12, borderTop: "1px solid #eee" },
};

function formatTime(dateStr) {
  if (dateStr == null || dateStr === "") return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function GuardMessages() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [deletingConversationId, setDeletingConversationId] = useState(null);
  const messagesEndRef = useRef(null);

  const selected = conversations.find((c) => c.id === selectedId);

  function normalizeMessage(m, index) {
    if (!m || typeof m !== "object") return null;
    const rawTs = m.created_at ?? m.createdAt;
    const ts = rawTs && !Number.isNaN(new Date(rawTs).getTime()) ? rawTs : new Date().toISOString();
    const senderType = m.sender_type === "guard" ? "guard" : (m.sender_type || "admin");
    return {
      id: m.id ?? m.message_id ?? `msg-${index}`,
      content: String(m.content ?? ""),
      sender_type: senderType,
      created_at: ts,
      createdAt: ts,
    };
  }

  const fetchMessagesForConversation = useCallback((convId, setErrorOnFail = false, markRead = false, showLoading = true) => {
    if (!convId) return;
    if (showLoading) setMessagesLoading(true);
    getMessages(convId, { page: 1, limit: 50 })
      .then((res) => {
        const raw = res.data?.messages ?? res.data?.data?.messages ?? res.data;
        const list = Array.isArray(raw) ? raw : (raw && raw.messages ? raw.messages : []);
        const normalized = list.map((item, i) => normalizeMessage(item, i)).filter(Boolean);
        setMessages((prev) => {
          const optimistic = prev.filter((m) => m.id && String(m.id).startsWith("temp-"));
          if (optimistic.length === 0) return normalized;
          const merged = [...normalized];
          const ts = (msg) => {
            const t = new Date(msg?.created_at ?? msg?.createdAt).getTime();
            return Number.isNaN(t) ? 0 : t;
          };
          for (const o of optimistic) {
            const alreadyInServer = normalized.some(
              (m) => m.content === o.content && Math.abs(ts(m) - ts(o)) < 30000
            );
            if (!alreadyInServer) merged.push(o);
          }
          merged.sort((a, b) => ts(a) - ts(b));
          return merged;
        });
        if (setErrorOnFail) setError("");
      })
      .catch((e) => {
        if (setErrorOnFail) {
          setMessages([]);
          setError(e?.response?.data?.message || "Failed to load messages");
        }
      })
      .finally(() => { if (showLoading) setMessagesLoading(false); });
    if (markRead) markConversationAsRead(convId).catch(() => {});
  }, []);

  const loadConversations = useCallback(() => {
    setLoading(true);
    setError("");
    listConversations()
      .then((res) => {
        const raw = res.data?.conversations ?? res.data?.data?.conversations;
        const list = Array.isArray(raw) ? raw : [];
        setConversations(list);
        if (list.length) setSelectedId((prev) => prev || list[0].id);
      })
      .catch((e) => setError(e?.response?.data?.message || "Failed to load conversations"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    setError("");
    setMessages([]);
    fetchMessagesForConversation(selectedId, true, true, true);

    const pollInterval = setInterval(() => {
      fetchMessagesForConversation(selectedId, false, false, false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(pollInterval);
  }, [selectedId, fetchMessagesForConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function isOwnMessage(msg) {
    return msg?.sender_type === "guard";
  }

  function handleSend() {
    const text = input.trim();
    if (!text || sending || !selectedId) return;
    setError("");
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      content: text,
      sender_type: "guard",
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput("");
    sendMessage(selectedId, { content: text, messageType: "text" })
      .then((res) => {
        const data = res?.data;
        const raw = data?.message ?? data?.data?.message ?? (data && typeof data === "object" && data.id ? data : null);
        const msgId = raw?.id ?? data?.id ?? tempId;
        const iso = raw?.created_at ?? raw?.createdAt;
        const validIso = iso && !Number.isNaN(new Date(iso).getTime()) ? iso : new Date().toISOString();
        const serverMsg = {
          id: msgId,
          content: (raw?.content ?? text).toString(),
          sender_type: raw?.sender_type ?? "guard",
          created_at: validIso,
          createdAt: validIso,
        };
        setMessages((prev) => prev.map((m) => (m.id === tempId ? serverMsg : m)));
      })
      .catch((e) => {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        const msg = e?.response?.data?.message || e?.message || "Failed to send";
        setError(msg);
      })
      .finally(() => setSending(false));
  }

  function handleDeleteMessage(msg) {
    if (!selectedId || !msg?.id || String(msg.id).startsWith("temp-")) return;
    setDeletingMessageId(msg.id);
    setError("");
    deleteMessage(selectedId, msg.id)
      .then(() => {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      })
      .catch((e) => {
        setError(e?.response?.data?.message || "Failed to delete message");
      })
      .finally(() => setDeletingMessageId(null));
  }

  function handleDeleteConversation(conv, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!conv?.id || deletingConversationId) return;
    if (!window.confirm("Leave this conversation? You will no longer see it in your list.")) return;
    setDeletingConversationId(conv.id);
    setError("");
    deleteConversation(conv.id)
      .then(() => {
        const rest = conversations.filter((c) => c.id !== conv.id);
        setConversations(rest);
        if (selectedId === conv.id) {
          setSelectedId(rest.length ? rest[0].id : null);
        }
      })
      .catch((err) => {
        setError(err?.response?.data?.message || "Failed to leave conversation");
      })
      .finally(() => setDeletingConversationId(null));
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading conversations…</div>;
  }

  return (
    <div style={styles.layout}>
      <div style={styles.sidebar}>
        <div style={{ padding: 12, borderBottom: "1px solid #eee", fontWeight: 600 }}>Messages</div>
        <div style={styles.list}>
          {conversations.length === 0 ? (
            <div style={{ padding: 16, color: "#666" }}>No conversations yet. An admin will add you to a group.</div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                style={{
                  ...styles.convItem,
                  ...(c.id === selectedId ? styles.convItemSelected : {}),
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                }}
                onClick={() => setSelectedId(c.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{c.name || c.displayName || "Unnamed"}</div>
                  {c.lastMessage && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      {c.lastMessage.content?.slice(0, 40)}
                      {c.lastMessage.content?.length > 40 ? "…" : ""}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDeleteConversation(c, e)}
                  disabled={deletingConversationId === c.id}
                  title="Leave conversation"
                  style={{
                    flexShrink: 0,
                    padding: "4px 8px",
                    fontSize: 12,
                    minHeight: 0,
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    background: "#fff",
                    cursor: deletingConversationId === c.id ? "default" : "pointer",
                  }}
                >
                  {deletingConversationId === c.id ? "…" : "Delete"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      <div style={styles.messageArea}>
        {!selectedId ? (
          <div style={{ padding: 24, color: "#666" }}>Select a conversation</div>
        ) : (
          <>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #eee", fontWeight: 500 }}>
              {selected?.name || selected?.displayName || "Conversation"}
            </div>
            {error && <div style={{ padding: "8px 16px", background: "#fff2f0", color: "#cf1322", fontSize: 14 }}>{error}</div>}
            <div style={styles.messages}>
              {messagesLoading && messages.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#666" }}>Loading messages…</div>
              ) : messages.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "#666" }}>No messages yet.</div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      ...styles.messageBubble,
                      ...(isOwnMessage(msg) ? styles.messageBubbleOwn : styles.messageBubbleOther),
                    }}
                  >
                    <div>{msg.content}</div>
                    <div style={styles.messageMeta}>
                      {formatTime(msg.created_at || msg.createdAt)} {isOwnMessage(msg) ? "· You" : ""}
                      {!String(msg.id).startsWith("temp-") && (
                        <span style={{ marginLeft: 8 }}>
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: "2px 8px", fontSize: 12, minHeight: 0 }}
                            onClick={() => handleDeleteMessage(msg)}
                            disabled={deletingMessageId === msg.id}
                          >
                            {deletingMessageId === msg.id ? "…" : "Delete"}
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div style={styles.inputRow}>
              <input
                type="text"
                placeholder="Type a message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd" }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || sending}
                style={{ padding: "8px 16px", borderRadius: 8, background: "#1890ff", color: "#fff", border: "none", cursor: "pointer" }}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
