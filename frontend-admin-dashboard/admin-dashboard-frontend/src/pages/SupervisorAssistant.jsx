import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import { chatWithAssistant, exportGuardReportPDF } from "../services/api";

export default function SupervisorAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "👋 Hi! I'm AI AGENT 24. I can help you with:\n\n• Answering questions about guards, shifts, and locations\n• Creating and managing shifts\n• Assigning guards to shifts\n• Generating reports\n• Analyzing callout risks\n• Scheduling assistance\n\nWhat would you like to know or do?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloadingPdfFor, setDownloadingPdfFor] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    // Add user message immediately
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const res = await chatWithAssistant(userMessage.content, messages);
      
      if (res.data && res.data.ok) {
        const assistantMessage = {
          role: "assistant",
          content: res.data.response || res.data.answer || "I'm processing your request...",
          timestamp: new Date(),
          citations: res.data.citations || [],
          actions: res.data.actions || [],
          data: res.data.data || null,
        };
        
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(res.data?.message || "Failed to get response");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Request failed");
      const errorMessage = {
        role: "assistant",
        content: `❌ Sorry, I encountered an error: ${err?.response?.data?.message || err.message || "Unknown error"}`,
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDownloadReportPDF = async (guardId, tenantId) => {
    if (!guardId || downloadingPdfFor) return;
    setDownloadingPdfFor(guardId);
    setError("");
    try {
      const res = await exportGuardReportPDF(guardId, tenantId || undefined);
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guard-report-${guardId.slice(0, 8)}-${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to download PDF");
    } finally {
      setDownloadingPdfFor(null);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: "👋 Hi! I'm AI AGENT 24. I can help you with:\n\n• Answering questions about guards, shifts, and locations\n• Creating and managing shifts\n• Assigning guards to shifts\n• Generating reports\n• Analyzing callout risks\n• Scheduling assistance\n\nWhat would you like to know or do?",
        timestamp: new Date(),
      },
    ]);
    setError("");
  };

  const formatTimestamp = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="page">
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2>🤖 AI AGENT 24</h2>
            <p className="muted">Ask questions, get insights, and execute tasks using natural language.</p>
          </div>
          <button
            onClick={clearChat}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Clear Chat
          </button>
        </div>

        {/* Chat Messages */}
        <div
          style={{
            height: "calc(100vh - 350px)",
            minHeight: 400,
            maxHeight: 600,
            overflowY: "auto",
            border: "1px solid #e0e0e0",
            borderRadius: 8,
            padding: 16,
            backgroundColor: "#fafafa",
            marginBottom: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {messages.map((message, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: message.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "75%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  backgroundColor: message.role === "user" ? "#667eea" : message.isError ? "#fee" : "white",
                  color: message.role === "user" ? "white" : message.isError ? "#c00" : "#333",
                  border: message.isError ? "1px solid #fcc" : "1px solid #e0e0e0",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                }}
              >
                <div style={{ marginBottom: 4, fontSize: 13, opacity: 0.8 }}>
                  {message.role === "user" ? "You" : "🤖 AI AGENT 24"}
                </div>
                <div>{message.content}</div>
                
                {/* Citations */}
                {message.citations && message.citations.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.1)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.8 }}>Sources:</div>
                    {message.citations.map((citation, cIdx) => (
                      <div key={cIdx} style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                        • {citation.type || "Source"}: {citation.metadata ? JSON.stringify(citation.metadata) : citation.content}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions (for task execution results) */}
                {message.actions && message.actions.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.1)" }}>
                    {message.actions.map((action, aIdx) => (
                      <div key={aIdx} style={{ fontSize: 12, marginBottom: 8 }}>
                        {action.type === "open_in" && (
                          <button
                            type="button"
                            onClick={() => action.href && navigate(action.href)}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 8,
                              border: "1px solid #0ea5e9",
                              background: "#0ea5e9",
                              color: "white",
                              cursor: "pointer",
                              fontSize: 13,
                              fontWeight: 600,
                              marginRight: 8,
                            }}
                          >
                            {action.label || `Open ${(action.entityType || "results")}`}
                          </button>
                        )}
                        {action.type === "download_report_pdf" && (
                          <button
                            type="button"
                            onClick={() => handleDownloadReportPDF(action.guardId, action.tenantId)}
                            disabled={downloadingPdfFor === action.guardId}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 8,
                              border: "1px solid #667eea",
                              background: "#667eea",
                              color: "white",
                              cursor: downloadingPdfFor === action.guardId ? "wait" : "pointer",
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            {downloadingPdfFor === action.guardId ? "Downloading…" : (action.label || "Download as PDF")}
                          </button>
                        )}
                        {action.type === "shift_created" && `✅ Created shift: ${action.shiftId || "N/A"}`}
                        {action.type === "guard_assigned" && `✅ Assigned guard: ${action.guardName || "N/A"}`}
                        {action.type === "report_generated" && `✅ Generated report: ${action.reportId || "N/A"}`}
                      </div>
                    ))}
                  </div>
                )}

                {/* Search results (Advanced Search #31) */}
                {message.data?.searchResults && message.data.searchResults.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.1)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, opacity: 0.9 }}>Results:</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {message.data.searchResults.slice(0, 10).map((r, i) => (
                        <div
                          key={r.id || i}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "#f0f9ff",
                            border: "1px solid #bae6fd",
                            fontSize: 12,
                          }}
                        >
                          <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{r.entityType}:</span> {r.title}
                          {r.snippet && <div style={{ marginTop: 4, opacity: 0.85 }}>{r.snippet}</div>}
                          <button
                            type="button"
                            onClick={() => r.href && navigate(r.href)}
                            style={{
                              marginTop: 6,
                              padding: "4px 10px",
                              fontSize: 11,
                              borderRadius: 6,
                              border: "1px solid #0ea5e9",
                              background: "white",
                              color: "#0ea5e9",
                              cursor: "pointer",
                            }}
                          >
                            Open in app
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data (for structured responses like schedules, reports) */}
                {message.data && !message.data.searchResults && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.1)" }}>
                    {message.data.summary && (
                      <div style={{ fontSize: 12, marginBottom: 8 }}>
                        <strong>Summary:</strong> {JSON.stringify(message.data.summary)}
                      </div>
                    )}
                    {message.data.proposals && message.data.proposals.length > 0 && (
                      <div style={{ fontSize: 12 }}>
                        <strong>Proposals:</strong> {message.data.proposals.length} found
                      </div>
                    )}
                  </div>
                )}

                <div style={{ fontSize: 11, marginTop: 8, opacity: 0.6 }}>
                  {formatTimestamp(message.timestamp)}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 12,
                  backgroundColor: "white",
                  border: "1px solid #e0e0e0",
                }}
              >
                <div style={{ display: "flex", gap: 4 }}>
                  <span>🤔</span>
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error Display */}
        {error && (
          <div
            className="error"
            style={{
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              backgroundColor: "#fee",
              color: "#c00",
              border: "1px solid #fcc",
            }}
          >
            {error}
          </div>
        )}

        {/* Input Area */}
        <div style={{ display: "flex", gap: 8 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything... (e.g., 'Show me high-risk shifts for next week', 'Create a shift for John tomorrow 8am-4pm', 'Who is most reliable for night shifts?')"
            disabled={loading}
            style={{
              flex: 1,
              minHeight: 60,
              maxHeight: 120,
              padding: 12,
              borderRadius: 8,
              border: "1px solid #ccc",
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <button
            className="btnPrimary"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              minWidth: 100,
              height: "fit-content",
            }}
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          Press Enter to send, Shift+Enter for new line
        </div>

        {/* Quick Actions */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e0e0e0" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#666" }}>Quick Actions:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              "Show high-risk shifts",
              "List unfilled shifts",
              "Guard reliability report",
              "Recent callouts",
              "Search for Bob",
              "Find shifts at Downtown",
            ].map((action) => (
              <button
                key={action}
                onClick={() => {
                  setInput(action);
                  inputRef.current?.focus();
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {action}
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
