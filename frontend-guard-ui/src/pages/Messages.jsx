import React, { useCallback, useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import NavBar from "../components/NavBar";
import {
  listConversations,
  getMessages,
  sendMessage,
  deleteMessage,
  markConversationAsRead,
  deleteConversation,
} from "../services/messaging.service";
import "./Messages.css";

// Page wrapper so content is always visible (background + min height)
const pageWrap = {
  minHeight: "100vh",
  background: "#0f172a",
  color: "#e2e8f0",
};

const styles = {
  layout: {
    display: "flex",
    flexDirection: "row",
    gap: 16,
    height: "calc(100vh - 160px)",
    minHeight: 320,
    marginTop: 12,
    overflow: "hidden",
  },
  sidebar: {
    width: 320,
    minWidth: 200,
    maxWidth: "45vw",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(255,255,255,0.04)",
    overflow: "hidden",
  },
  sidebarHeader: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(148,163,184,0.15)",
    fontWeight: 700,
    fontSize: 15,
    color: "#f1f5f9",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: 8,
  },
  conversationItem: {
    padding: "12px 14px",
    borderRadius: 12,
    cursor: "pointer",
    marginBottom: 4,
    border: "1px solid transparent",
    background: "rgba(255,255,255,0.03)",
  },
  conversationItemActive: {
    background: "rgba(59,130,246,0.18)",
    border: "1px solid rgba(59,130,246,0.4)",
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(255,255,255,0.04)",
    overflow: "hidden",
  },
  threadHeader: {
    flexShrink: 0,
    padding: "12px 16px",
    borderBottom: "1px solid rgba(148,163,184,0.15)",
    fontWeight: 700,
    fontSize: 15,
    color: "#f1f5f9",
  },
  messagesArea: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    overflowX: "hidden",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  messageBubble: {
    maxWidth: "78%",
    padding: "10px 14px",
    borderRadius: 14,
    fontSize: 14,
    lineHeight: 1.45,
    alignSelf: "flex-start",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(148,163,184,0.12)",
    color: "#e2e8f0",
    wordBreak: "break-word",
    overflowWrap: "break-word",
  },
  messageBubbleOwn: {
    alignSelf: "flex-end",
    background: "rgba(59,130,246,0.22)",
    border: "1px solid rgba(59,130,246,0.35)",
    color: "#e2e8f0",
  },
  messageMeta: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 4,
  },
  inputRow: {
    flexShrink: 0,
    minHeight: 56,
    padding: "12px 14px",
    borderTop: "1px solid rgba(148,163,184,0.15)",
    background: "rgba(15,23,42,0.6)",
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  inputRowFixed: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    padding: "12px 14px",
    paddingBottom: "max(12px, env(safe-area-inset-bottom))",
    background: "#0f172a",
    borderTop: "1px solid rgba(148,163,184,0.25)",
    display: "flex",
    gap: 10,
    alignItems: "center",
    zIndex: 100,
    boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(229,231,235,0.5)",
    fontSize: 15,
  },
};

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Messages() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [leavingConversationId, setLeavingConversationId] = useState(null);
  const messagesEndRef = useRef(null);

  const selected = conversations.find((c) => c.id === selectedId);

  const loadConversations = useCallback(function loadConversations() {
    setLoading(true);
    setError("");
    listConversations()
      .then((res) => {
        const raw = res.data?.conversations ?? res.data?.data?.conversations;
        const list = Array.isArray(raw) ? raw : [];
        setConversations(list);
        if (list.length) setSelectedId((prev) => prev || list[0].id);
      })
      .catch((e) => {
        const msg = e?.response?.data?.message || e?.message || "Failed to load conversations";
        setError(msg);
        setConversations([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  function normalizeMessage(m, index) {
    if (!m || typeof m !== "object") return null;
    const senderType = m.sender_type === "guard" || m.sender_type === "admin" ? m.sender_type : "admin";
    const content = String(m.content ?? m.text ?? "").trim();
    return {
      id: m.id ?? m.message_id ?? `msg-${index}`,
      content,
      sender_type: senderType,
      created_at: m.created_at ?? m.createdAt,
      createdAt: m.createdAt ?? m.created_at,
    };
  }

  const fetchMessagesForConversation = useCallback((convId, setErrorOnFail = false, markRead = false) => {
    if (!convId) return;
    setMessagesLoading(true);
    getMessages(convId, { page: 1, limit: 50 })
      .then((res) => {
        const raw = res.data?.messages ?? res.data?.data?.messages ?? res.data;
        const list = Array.isArray(raw) ? raw : (raw && raw.messages ? raw.messages : []);
        const normalized = list.map((item, i) => normalizeMessage(item, i)).filter(Boolean);
        setMessages((prev) => {
          const optimistic = prev.filter((m) => m.id && String(m.id).startsWith("temp-"));
          if (optimistic.length === 0) return normalized;
          const merged = [...normalized];
          for (const o of optimistic) {
            const alreadyInServer = normalized.some(
              (m) =>
                m.content === o.content &&
                Math.abs(new Date(m.created_at || m.createdAt).getTime() - new Date(o.created_at || o.createdAt).getTime()) < 30000
            );
            if (!alreadyInServer) merged.push(o);
          }
          merged.sort((a, b) => new Date(a.created_at || a.createdAt).getTime() - new Date(b.created_at || b.createdAt).getTime());
          return merged;
        });
        if (setErrorOnFail) setError("");
      })
      .catch((e) => {
        setMessages([]);
        if (setErrorOnFail) {
          setError(e?.response?.data?.message || e?.message || "Failed to load messages");
        }
      })
      .finally(() => setMessagesLoading(false));
    if (markRead) markConversationAsRead(convId).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    setError("");
    setMessages([]);
    fetchMessagesForConversation(selectedId, true, true);

    // Poll for new messages (e.g. from admin) every 3 seconds so admin messages appear quickly
    const pollInterval = setInterval(() => {
      fetchMessagesForConversation(selectedId, false, false);
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [selectedId, fetchMessagesForConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    sendMessage(selectedId, { content: text })
      .then((res) => {
        const raw = res.data?.message ?? res.data?.data?.message ?? res.data;
        const serverMsg =
          raw && typeof raw === "object"
            ? {
                id: raw.id ?? tempId,
                content: raw.content ?? text,
                sender_type: raw.sender_type ?? "guard",
                created_at: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
                createdAt: raw.createdAt ?? raw.created_at,
              }
            : optimisticMsg;
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? serverMsg : m))
        );
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? {
                  ...c,
                  lastMessage: { content: text, createdAt: new Date().toISOString() },
                  updatedAt: new Date().toISOString(),
                }
              : c
          )
        );
      })
      .catch((e) => {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        const status = e?.response?.status;
        const body = e?.response?.data;
        const msg = body?.message || body?.error || e?.message || "Failed to send";
        console.error("[Messages] Send failed:", status, body || e);
        setError(status ? `Send failed (${status}): ${msg}` : msg);
      })
      .finally(() => setSending(false));
  }

  const isOwnMessage = (msg) => msg.sender_type === "guard";

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

  function handleLeaveConversation(conv, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!conv?.id || leavingConversationId) return;
    if (!window.confirm("Leave this conversation? You will no longer see it in your list.")) return;
    setLeavingConversationId(conv.id);
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
      .finally(() => setLeavingConversationId(null));
  }

  return (
    <div className="messagesPageWrap" style={pageWrap}>
      <NavBar />
      <div style={{ padding: "16px 12px", maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 12, fontWeight: 800, fontSize: 22, color: "#f1f5f9" }}>Messages</h1>
        <p style={{ marginBottom: 12, fontSize: 14, color: "#cbd5e1" }}>
          Chat with your supervisors. You only see conversations you’re part of.
        </p>
        {error && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              borderRadius: 12,
              background: "rgba(239,68,68,0.12)",
              color: "#fecaca",
            }}
          >
            {error}
          </div>
        )}
        <div className="messagesLayout" style={styles.layout}>
          <div className="messagesSidebar" style={styles.sidebar}>
            <div style={styles.sidebarHeader}>Conversations</div>
            <div style={styles.list}>
              {loading ? (
                <div style={{ padding: 20, color: "rgba(255,255,255,0.6)" }}>Loading…</div>
              ) : conversations.length === 0 ? (
                <div style={{ padding: 20, color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
                  No conversations yet. An admin can add you to a group to start messaging.
                </div>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      ...styles.conversationItem,
                      ...(selectedId === c.id ? styles.conversationItemActive : {}),
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#f1f5f9" }}>{c.name || "Unnamed"}</div>
                      {c.lastMessage && (
                        <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2, wordBreak: "break-word", lineHeight: 1.35 }}>
                          {(c.lastMessage.content ?? c.lastMessage.text ?? "").slice(0, 80)}
                          {(c.lastMessage.content ?? c.lastMessage.text ?? "").length > 80 ? "…" : ""}
                        </div>
                      )}
                      {c.unreadCount > 0 && (
                        <span style={{ fontSize: 11, color: "#60a5fa", marginTop: 4, display: "inline-block" }}>
                          {c.unreadCount} new
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleLeaveConversation(c, e)}
                      disabled={leavingConversationId === c.id}
                      title="Leave conversation"
                      style={{
                        flexShrink: 0,
                        padding: "4px 10px",
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid rgba(148,163,184,0.35)",
                        background: "rgba(255,255,255,0.06)",
                        color: "#cbd5e1",
                        cursor: leavingConversationId === c.id ? "default" : "pointer",
                      }}
                    >
                      {leavingConversationId === c.id ? "…" : "Leave"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="messagesMainCol" style={styles.main}>
            {!selected ? (
              <div style={styles.emptyState}>
                Select a conversation to view and send messages
              </div>
            ) : (
              <>
                <div style={styles.threadHeader}>
                  {selected.name || "Unnamed"} {selected.type === "group" ? " (Group)" : ""}
                </div>
                <div className="messagesScrollArea" style={styles.messagesArea}>
                  {messagesLoading ? (
                    <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
                      Loading messages…
                    </div>
                  ) : messages.length === 0 ? (
                    <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
                      No messages yet. Send one below.
                    </div>
                  ) : null}
                  {!messagesLoading && messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="messagesPageBubble"
                      style={{
                        ...styles.messageBubble,
                        ...(isOwnMessage(msg) ? styles.messageBubbleOwn : {}),
                      }}
                    >
                      <div style={{ color: "#e2e8f0", wordBreak: "break-word" }}>{msg.content || "(no text)"}</div>
                      <div style={styles.messageMeta}>
                        {formatTime(msg.created_at || msg.createdAt)} {isOwnMessage(msg) ? "· You" : ""}
                        {!String(msg.id).startsWith("temp-") && (
                          <span style={{ marginLeft: 8 }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(msg)}
                              disabled={deletingMessageId === msg.id}
                              style={{
                                padding: "2px 8px",
                                fontSize: 12,
                                borderRadius: 8,
                                border: "1px solid rgba(148,163,184,0.3)",
                                background: "rgba(239,68,68,0.2)",
                                color: "#fca5a5",
                                cursor: deletingMessageId === msg.id ? "not-allowed" : "pointer",
                              }}
                            >
                              {deletingMessageId === msg.id ? "…" : "Delete"}
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  <div ref={messagesEndRef} />
                  {/* Spacer so last message is not hidden behind fixed input bar (Android safe area) */}
                  <div style={{ height: 100, minHeight: 80 }} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Input bar in portal so it is never clipped; always visible on Android WebView */}
        {createPortal(
          <div
            className="messagesInputRow messagesInputRowFixed"
            role="region"
            aria-label="Message input"
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              width: "100%",
              maxWidth: "100vw",
              zIndex: 2147483646,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              paddingLeft: "max(14px, env(safe-area-inset-left, 14px))",
              paddingRight: "max(14px, env(safe-area-inset-right, 14px))",
              paddingBottom: "max(14px, env(safe-area-inset-bottom, 14px))",
              background: "#0f172a",
              borderTop: "2px solid rgba(148,163,184,0.4)",
              boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <input
              type="text"
              className="messagesPageInput"
              placeholder={selected ? "Type a message…" : "Select a conversation above"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && selected && handleSend()}
              disabled={!selected}
              style={{
                flex: 1,
                padding: "14px 16px",
                borderRadius: 12,
                border: "2px solid rgba(148,163,184,0.5)",
                background: selected ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)",
                color: "#e2e8f0",
                fontSize: 16,
                minHeight: 48,
              }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!selected || !input.trim() || sending}
              style={{
                padding: "14px 24px",
                borderRadius: 12,
                fontWeight: 700,
                background: selected && input.trim() && !sending ? "#3b82f6" : "#475569",
                border: "none",
                color: "#fff",
                fontSize: 16,
                minHeight: 48,
                minWidth: 80,
                cursor: selected && input.trim() && !sending ? "pointer" : "default",
              }}
            >
              {sending ? "…" : "Send"}
            </button>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
