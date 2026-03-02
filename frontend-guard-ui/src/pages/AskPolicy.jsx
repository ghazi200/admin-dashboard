import React, { useState, useEffect } from "react";
import NavBar from "../components/NavBar";
import Modal from "../components/Modal";
import { askPolicy } from "../services/guardApi";

export default function AskPolicy() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState([]);
  const [qaId, setQaId] = useState(null);
  const [escalateRecommended, setEscalateRecommended] = useState(false);

  const [err, setErr] = useState("");
  const [openEscalate, setOpenEscalate] = useState(false);

  // Animation state
  const [displayedText, setDisplayedText] = useState("");
  const fullText = "My name is AGENT 24 what can I help you with ?";

  // Typewriter animation effect
  useEffect(() => {
    let currentIndex = 0;
    let timeoutId;
    const typingSpeed = 50; // milliseconds per character

    const typeText = () => {
      if (currentIndex < fullText.length) {
        setDisplayedText(fullText.slice(0, currentIndex + 1));
        currentIndex++;
        timeoutId = setTimeout(typeText, typingSpeed);
      }
    };

    // Start typing after a short delay
    const timer = setTimeout(typeText, 300);
    return () => {
      clearTimeout(timer);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [fullText]);

  const submit = async () => {
    setErr("");
    setAnswer("");
    setCitations([]);
    setQaId(null);
    setEscalateRecommended(false);

    const q = question.trim();
    if (!q) return;

    setLoading(true);
    try {
      const res = await askPolicy({ question: q });
      const data = res?.data || {};
      setAnswer(data.answer || "");
      setCitations(data.citations || []);
      setQaId(data.qaId || null);
      setEscalateRecommended(!!data.escalateRecommended);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="card">
          <h2>Ask Policy</h2>

          {/* Animated Agent 24 Statement */}
          <div
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              borderRadius: 12,
              padding: 20,
              marginBottom: 24,
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
              color: "white",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <style>
              {`
                @keyframes agentBlink {
                  0%, 50% { opacity: 1; }
                  51%, 100% { opacity: 0; }
                }
                .agent-cursor {
                  display: inline-block;
                  width: 2px;
                  height: 20px;
                  background: white;
                  margin-left: 4px;
                  animation: agentBlink 1s infinite;
                }
              `}
            </style>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                lineHeight: 1.6,
                minHeight: 28,
              }}
            >
              {displayedText}
              <span className="agent-cursor" />
            </div>
          </div>

          <div className="field">
            <label>Your question</label>
            <textarea
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about company policy..."
            />
          </div>

          <button className="btnPrimary" onClick={submit} disabled={loading}>
            {loading ? "Asking..." : "Ask"}
          </button>

          {err ? <div className="error">{err}</div> : null}

          {answer ? (
            <div className="result">
              <div className="resultTitle">Answer</div>
              <div className="resultBody">{answer}</div>

              <div className="resultMeta">
                {qaId ? <div>QA ID: {qaId}</div> : null}
              </div>

              <div className="resultTitle">Sources</div>
              {citations?.length ? (
                <ul>
                  {citations.map((c, i) => (
                    <li key={i}>
                      {c.document_title || c.documentTitle || "Policy"} —{" "}
                      {c.section_title || c.sectionTitle || "Section"}{" "}
                      {c.page_start ? `(p. ${c.page_start}${c.page_end ? `-${c.page_end}` : ""})` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="muted">No citations returned.</div>
              )}

              {escalateRecommended ? (
                <button className="btn" onClick={() => setOpenEscalate(true)}>
                  Escalate to Supervisor
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Contact Section */}
          <div
            style={{
              marginTop: 32,
              padding: 20,
              border: "1px solid rgba(148,163,184,0.18)",
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.03)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 600, color: "var(--text)" }}>
              Need Additional Help?
            </h3>
            <p style={{ marginBottom: 20, color: "var(--muted)", fontSize: 14 }}>
              Contact our support team for assistance with policy questions or concerns.
            </p>
            
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: 16,
              }}
            >
              {/* HR Contact */}
              <div
                style={{
                  padding: 16,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.18)",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 12, color: "var(--text)", fontSize: 15 }}>
                  Human Resources (HR)
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: "var(--muted)" }}>
                  <strong style={{ color: "var(--text)" }}>Phone:</strong>{" "}
                  <a 
                    href="tel:+1-555-123-4567" 
                    style={{ color: "var(--accent)", textDecoration: "none" }}
                    onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                    onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                  >
                    (555) 123-4567
                  </a>
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>
                  <strong style={{ color: "var(--text)" }}>Email:</strong>{" "}
                  <a 
                    href="mailto:hr@abesecurity.com" 
                    style={{ color: "var(--accent)", textDecoration: "none" }}
                    onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                    onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                  >
                    hr@abesecurity.com
                  </a>
                </div>
              </div>

              {/* Supervisor Contact */}
              <div
                style={{
                  padding: 16,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.18)",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 12, color: "var(--text)", fontSize: 15 }}>
                  Supervisor
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: "var(--muted)" }}>
                  <strong style={{ color: "var(--text)" }}>Phone:</strong>{" "}
                  <a 
                    href="tel:+1-555-234-5678" 
                    style={{ color: "var(--accent)", textDecoration: "none" }}
                    onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                    onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                  >
                    (555) 234-5678
                  </a>
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>
                  <strong style={{ color: "var(--text)" }}>Email:</strong>{" "}
                  <a 
                    href="mailto:supervisor@abesecurity.com" 
                    style={{ color: "var(--accent)", textDecoration: "none" }}
                    onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                    onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                  >
                    supervisor@abesecurity.com
                  </a>
                </div>
              </div>

              {/* Payroll Contact */}
              <div
                style={{
                  padding: 16,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.18)",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 12, color: "var(--text)", fontSize: 15 }}>
                  Payroll
                </div>
                <div style={{ fontSize: 14, marginBottom: 8, color: "var(--muted)" }}>
                  <strong style={{ color: "var(--text)" }}>Phone:</strong>{" "}
                  <a 
                    href="tel:+1-555-345-6789" 
                    style={{ color: "var(--accent)", textDecoration: "none" }}
                    onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                    onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                  >
                    (555) 345-6789
                  </a>
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)" }}>
                  <strong style={{ color: "var(--text)" }}>Email:</strong>{" "}
                  <a 
                    href="mailto:payroll@abesecurity.com" 
                    style={{ color: "var(--accent)", textDecoration: "none" }}
                    onMouseEnter={(e) => e.target.style.textDecoration = "underline"}
                    onMouseLeave={(e) => e.target.style.textDecoration = "none"}
                  >
                    payroll@abesecurity.com
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={openEscalate}
        title="Escalate to Supervisor"
        onClose={() => setOpenEscalate(false)}
      >
        <div className="muted">
          For now this opens a modal. Next we’ll connect it to the supervisor notification flow.
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btnPrimary" onClick={() => setOpenEscalate(false)}>
            OK
          </button>
        </div>
      </Modal>
    </>
  );
}
