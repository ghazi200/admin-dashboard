import React, { useCallback, useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import {
  listConversations,
  getConversation,
  getMessages,
  sendMessage,
  deleteMessage,
  markConversationAsRead,
  createGroupConversation,
  addParticipants,
  removeParticipant,
  deleteConversation,
} from "../services/messaging.service";
import { listGuards } from "../services/api";

const MESSAGES_PAGE_STYLES = {
  layout: {
    display: "flex",
    gap: 16,
    height: "calc(100vh - 120px)",
    minHeight: 400,
  },
  sidebar: {
    width: 320,
    minWidth: 280,
    display: "flex",
    flexDirection: "column",
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(255,255,255,0.03)",
    overflow: "hidden",
  },
  sidebarHeader: {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(148,163,184,0.14)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
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
    background: "rgba(255,255,255,0.02)",
  },
  conversationItemActive: {
    background: "rgba(124,58,237,0.15)",
    border: "1px solid rgba(124,58,237,0.35)",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(255,255,255,0.03)",
    overflow: "hidden",
  },
  threadHeader: {
    padding: "12px 16px",
    borderBottom: "1px solid rgba(148,163,184,0.14)",
    fontWeight: 700,
    fontSize: 15,
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  messageBubble: {
    maxWidth: "75%",
    padding: "10px 14px",
    borderRadius: 14,
    fontSize: 14,
    lineHeight: 1.45,
    alignSelf: "flex-start",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(148,163,184,0.12)",
  },
  messageBubbleOwn: {
    alignSelf: "flex-end",
    background: "rgba(124,58,237,0.25)",
    border: "1px solid rgba(124,58,237,0.4)",
  },
  messageMeta: {
    fontSize: 11,
    opacity: 0.7,
    marginTop: 4,
  },
  inputRow: {
    padding: 14,
    borderTop: "1px solid rgba(148,163,184,0.14)",
    display: "flex",
    gap: 10,
    alignItems: "flex-end",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(229,231,235,0.55)",
    fontSize: 15,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    width: "100%",
    maxWidth: 420,
    padding: 24,
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.2)",
    background: "var(--bg)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
  },
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

export default function Messages() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupGuardIds, setNewGroupGuardIds] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [guards, setGuards] = useState([]);
  const [guardsLoading, setGuardsLoading] = useState(false);
  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const [addParticipantGuardIds, setAddParticipantGuardIds] = useState([]);
  const [addingParticipants, setAddingParticipants] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [deletingConversationId, setDeletingConversationId] = useState(null);
  const [groupParticipants, setGroupParticipants] = useState([]);
  const [removingParticipantId, setRemovingParticipantId] = useState(null);
  const messagesEndRef = useRef(null);

  const selected = conversations.find((c) => c.id === selectedId);

  // Load guards when opening New group or Add participants modal
  useEffect(() => {
    if (!showNewGroup && !showAddParticipants) return;
    setGuardsLoading(true);
    listGuards()
      .then((res) => {
        const raw = res.data?.guards ?? res.data;
        const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data) ? raw.data : []);
        setGuards(list);
      })
      .catch(() => setGuards([]))
      .finally(() => setGuardsLoading(false));
  }, [showNewGroup, showAddParticipants]);

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
      .catch((e) => setError(e?.response?.data?.message || "Failed to load conversations"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  function normalizeMessage(m, index) {
    if (!m || typeof m !== "object") return null;
    const rawTs = m.created_at ?? m.createdAt;
    const ts = rawTs && !Number.isNaN(new Date(rawTs).getTime()) ? rawTs : new Date().toISOString();
    return {
      id: m.id ?? m.message_id ?? `msg-${index}`,
      content: String(m.content ?? ""),
      sender_type: m.sender_type ?? "admin",
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
        setPagination(res.data?.pagination ?? res.data?.data?.pagination ?? { page: 1, total: normalized.length, totalPages: 1 });
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

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    setError("");
    setMessages([]);
    fetchMessagesForConversation(selectedId, true, true, true);

    // Poll for new messages (e.g. from guard) every 5 seconds — no loading flicker
    const pollInterval = setInterval(() => {
      fetchMessagesForConversation(selectedId, false, false, false);
    }, 5000);
    return () => clearInterval(pollInterval);
  }, [selectedId, fetchMessagesForConversation]);

  // Load participants when viewing a group conversation (for Remove guard UI)
  useEffect(() => {
    if (!selectedId || selected?.type !== "group") {
      setGroupParticipants([]);
      return;
    }
    getConversation(selectedId)
      .then((res) => {
        const conv = res.data?.conversation ?? res.data?.data?.conversation ?? res.data;
        setGroupParticipants(Array.isArray(conv?.participants) ? conv.participants : []);
      })
      .catch(() => setGroupParticipants([]));
  }, [selectedId, selected?.type]);

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
      sender_type: "admin",
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput("");
    // Same body as test script: { content, messageType: 'text' }
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
          sender_type: raw?.sender_type ?? "admin",
          created_at: validIso,
          createdAt: validIso,
        };
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? serverMsg : m))
        );
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? {
                  ...c,
                  lastMessage: { content: text, createdAt: serverMsg.createdAt },
                  updatedAt: serverMsg.createdAt,
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
        setError(status ? `Send failed (${status}): ${msg}` : msg);
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
        const msg = e?.response?.data?.message || "Failed to delete message";
        const detail = e?.response?.data?.error;
        setError(detail ? `${msg}: ${detail}` : msg);
      })
      .finally(() => setDeletingMessageId(null));
  }

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name || creatingGroup) return;
    setCreatingGroup(true);
    createGroupConversation({ name, participantIds: newGroupGuardIds })
      .then((res) => {
        const raw = res.data?.conversation ?? res.data?.data?.conversation;
        if (raw && raw.id) {
          const conv = {
            id: raw.id,
            name: raw.name ?? name,
            type: raw.type ?? "group",
            lastMessage: null,
            unreadCount: 0,
            updatedAt: raw.updated_at ?? raw.updatedAt ?? new Date().toISOString(),
            ...raw,
          };
          setConversations((prev) => [conv, ...prev]);
          setSelectedId(conv.id);
        }
        setShowNewGroup(false);
        setNewGroupName("");
        setNewGroupGuardIds([]);
      })
      .catch((e) => setError(e?.response?.data?.message || e?.response?.data?.error || "Failed to create group"))
      .finally(() => setCreatingGroup(false));
  }

  function toggleNewGroupGuard(guardId) {
    setNewGroupGuardIds((prev) =>
      prev.includes(guardId) ? prev.filter((id) => id !== guardId) : [...prev, guardId]
    );
  }

  function handleAddParticipants() {
    if (!selectedId || addParticipantGuardIds.length === 0 || addingParticipants) return;
    setAddingParticipants(true);
    addParticipants(selectedId, addParticipantGuardIds)
      .then(() => {
        setShowAddParticipants(false);
        setAddParticipantGuardIds([]);
        loadConversations();
        if (selected?.id === selectedId) {
          getConversation(selectedId).then((res) => {
            const conv = res.data?.conversation ?? res.data?.data?.conversation ?? res.data;
            if (conv) {
              const participants = conv.participants ?? [];
              setGroupParticipants(participants);
              setConversations((prev) =>
                prev.map((c) => (c.id === selectedId ? { ...c, participants } : c))
              );
            }
          }).catch(() => {});
        }
      })
      .catch((e) => setError(e?.response?.data?.message || "Failed to add participants"))
      .finally(() => setAddingParticipants(false));
  }

  function toggleAddParticipantGuard(guardId) {
    setAddParticipantGuardIds((prev) =>
      prev.includes(guardId) ? prev.filter((id) => id !== guardId) : [...prev, guardId]
    );
  }

  function handleDeleteConversation(conv, e) {
    e.preventDefault();
    e.stopPropagation();
    if (!conv?.id || deletingConversationId) return;
    if (!window.confirm(`Delete conversation "${conv.name || "Unnamed"}"? This cannot be undone.`)) return;
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
        setError(err?.response?.data?.message || "Failed to delete conversation");
      })
      .finally(() => setDeletingConversationId(null));
  }

  function handleRemoveParticipant(p) {
    if (!selectedId || !p?.participant_id || removingParticipantId) return;
    if (p.participant_type !== "guard") return;
    const name = p.display_name || p.displayName || "Guard";
    if (!window.confirm(`Remove ${name} from this conversation? They will no longer see it.`)) return;
    setRemovingParticipantId(p.participant_id);
    setError("");
    removeParticipant(selectedId, p.participant_id)
      .then(() => {
        setGroupParticipants((prev) => prev.filter((x) => x.participant_id !== p.participant_id));
        loadConversations();
      })
      .catch((err) => {
        setError(err?.response?.data?.message || "Failed to remove participant");
      })
      .finally(() => setRemovingParticipantId(null));
  }

  // Backend may store admin as UUID; we only have integer adminId in localStorage — treat all admin-sent as "own" for display
  const isOwnMessage = (msg) => msg.sender_type === "admin";

  return (
    <div className="container" style={{ padding: "16px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontWeight: 800 }}>Messages</h1>
        <Link to="/messages/guard" style={{ fontSize: 14, color: "var(--muted)" }}>Guard view (test)</Link>
      </div>
      {error && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 12, background: "rgba(239,68,68,0.12)", color: "#fecaca" }}>
          {error}
        </div>
      )}
      <div style={MESSAGES_PAGE_STYLES.layout}>
        <div style={MESSAGES_PAGE_STYLES.sidebar}>
          <div style={MESSAGES_PAGE_STYLES.sidebarHeader}>
            <span style={{ fontWeight: 700 }}>Conversations</span>
            <button
              type="button"
              className="btn btnPrimary"
              onClick={() => setShowNewGroup(true)}
            >
              New group
            </button>
          </div>
          <div style={MESSAGES_PAGE_STYLES.list}>
            {loading ? (
              <div style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 20, color: "var(--muted)", fontSize: 14 }}>
                No conversations yet. Create a group to start.
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  style={{
                    ...MESSAGES_PAGE_STYLES.conversationItem,
                    ...(selectedId === c.id ? MESSAGES_PAGE_STYLES.conversationItemActive : {}),
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name || "Unnamed"}</div>
                    {c.lastMessage && (
                      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                        {c.lastMessage.content?.slice(0, 50)}
                        {c.lastMessage.content?.length > 50 ? "…" : ""}
                      </div>
                    )}
                    {c.unreadCount > 0 && (
                      <span style={{ fontSize: 11, color: "var(--accent)", marginTop: 4, display: "inline-block" }}>
                        {c.unreadCount} new
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={(e) => handleDeleteConversation(c, e)}
                    disabled={deletingConversationId === c.id}
                    title="Delete conversation"
                    style={{ flexShrink: 0, padding: "4px 8px", fontSize: 12, minHeight: 0, opacity: 0.8 }}
                  >
                    {deletingConversationId === c.id ? "…" : "Delete"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={MESSAGES_PAGE_STYLES.main}>
          {!selected ? (
            <div style={MESSAGES_PAGE_STYLES.emptyState}>
              Select a conversation or create a new group
            </div>
          ) : (
            <>
              <div style={{ ...MESSAGES_PAGE_STYLES.threadHeader, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{selected.name || "Unnamed"} {selected.type === "group" ? " (Group)" : ""}</span>
                {selected.type === "group" && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => { setAddParticipantGuardIds([]); setShowAddParticipants(true); }}
                    style={{ fontSize: 13, padding: "6px 12px" }}
                  >
                    Add participants
                  </button>
                )}
              </div>
              {selected.type === "group" && groupParticipants.length > 0 && (
                <div style={{ padding: "8px 16px", borderBottom: "1px solid rgba(148,163,184,0.14)", fontSize: 13, display: "flex", flexWrap: "wrap", gap: "8px 12px", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, marginRight: 4 }}>Participants:</span>
                  {groupParticipants.map((p) => (
                    <span
                      key={p.participant_id || p.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(148,163,184,0.15)",
                      }}
                    >
                      <span>{p.display_name || p.displayName || (p.participant_type === "guard" ? "Guard" : "Admin")}</span>
                      {p.participant_type === "guard" && (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => handleRemoveParticipant(p)}
                          disabled={removingParticipantId === p.participant_id}
                          title="Remove from conversation"
                          style={{ padding: "2px 8px", fontSize: 11, minHeight: 0, opacity: 0.9 }}
                        >
                          {removingParticipantId === p.participant_id ? "…" : "Remove"}
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              <div style={MESSAGES_PAGE_STYLES.messagesArea}>
                {messagesLoading ? (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
                    Loading messages…
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
                    No messages yet. Send one below.
                  </div>
                ) : null}
                {!messagesLoading && messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      ...MESSAGES_PAGE_STYLES.messageBubble,
                      ...(isOwnMessage(msg) ? MESSAGES_PAGE_STYLES.messageBubbleOwn : {}),
                    }}
                  >
                    <div>{msg.content}</div>
                    <div style={MESSAGES_PAGE_STYLES.messageMeta}>
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
                ))}

                <div ref={messagesEndRef} />
              </div>
              <div style={MESSAGES_PAGE_STYLES.inputRow}>
                <input
                  type="text"
                  className="input"
                  placeholder="Type a message…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btnPrimary"
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showNewGroup && (
        <div
          style={MESSAGES_PAGE_STYLES.modalOverlay}
          onClick={() => !creatingGroup && setShowNewGroup(false)}
        >
          <div style={MESSAGES_PAGE_STYLES.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>New group</h3>
            <input
              type="text"
              className="input"
              placeholder="Group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <p style={{ marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>Select guards to add (they will receive messages in this group):</p>
            <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 16, border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10, padding: 8 }}>
              {guardsLoading ? (
                <div style={{ padding: 12, color: "var(--muted)", fontSize: 14 }}>Loading guards…</div>
              ) : guards.length === 0 ? (
                <div style={{ padding: 12, color: "var(--muted)", fontSize: 14 }}>No guards found. Create guards in the Guards page first.</div>
              ) : (
                guards.map((g) => (
                  <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={newGroupGuardIds.includes(g.id)}
                      onChange={() => toggleNewGroupGuard(g.id)}
                    />
                    <span style={{ fontWeight: 500 }}>{g.name || "Unnamed"}</span>
                    {g.email && <span style={{ fontSize: 12, color: "var(--muted)" }}>({g.email})</span>}
                  </label>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setShowNewGroup(false)} disabled={creatingGroup}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btnPrimary"
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || creatingGroup}
              >
                {creatingGroup ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddParticipants && (
        <div
          style={MESSAGES_PAGE_STYLES.modalOverlay}
          onClick={() => !addingParticipants && setShowAddParticipants(false)}
        >
          <div style={MESSAGES_PAGE_STYLES.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>Add participants</h3>
            <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>Select guards to add to this group:</p>
            <div style={{ maxHeight: 280, overflowY: "auto", marginBottom: 16, border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10, padding: 8 }}>
              {guardsLoading ? (
                <div style={{ padding: 12, color: "var(--muted)", fontSize: 14 }}>Loading guards…</div>
              ) : guards.length === 0 ? (
                <div style={{ padding: 12, color: "var(--muted)", fontSize: 14 }}>No guards found.</div>
              ) : (
                guards.map((g) => (
                  <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={addParticipantGuardIds.includes(g.id)}
                      onChange={() => toggleAddParticipantGuard(g.id)}
                    />
                    <span style={{ fontWeight: 500 }}>{g.name || "Unnamed"}</span>
                    {g.email && <span style={{ fontSize: 12, color: "var(--muted)" }}>({g.email})</span>}
                  </label>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn" onClick={() => setShowAddParticipants(false)} disabled={addingParticipants}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btnPrimary"
                onClick={handleAddParticipants}
                disabled={addParticipantGuardIds.length === 0 || addingParticipants}
              >
                {addingParticipants ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
