import React, { useState, useEffect } from "react";
import NavBar from "../components/NavBar";
import { askPayroll, getGuardEarnings, getPayStubs } from "../services/guardApi";
import { getGuardApiUrl } from "../config/apiUrls";

export default function Payroll() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const [answer, setAnswer] = useState("");
  const [err, setErr] = useState("");
  const [payStubData, setPayStubData] = useState(null); // Store pay stub data separately
  const [payrollMode, setPayrollMode] = useState("PAYSTUB_UPLOAD"); // Track payroll mode
  const [earningsData, setEarningsData] = useState(null); // Earnings tracker data
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [showEarningsTracker, setShowEarningsTracker] = useState(true); // Show earnings tracker by default
  const [payStubs, setPayStubs] = useState([]); // All pay stubs
  const [payStubsLoading, setPayStubsLoading] = useState(false);
  const [showPayStubs, setShowPayStubs] = useState(true); // Show pay stubs section by default

  // Animation state
  const [displayedText, setDisplayedText] = useState("");
  const fullText = "My name is AGENT 24, how can I help you with your payroll questions?";

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

  // Load earnings data and pay stubs on mount
  useEffect(() => {
    loadEarnings();
    loadPayStubs();
  }, []);

  async function loadEarnings() {
    try {
      setEarningsLoading(true);
      const response = await getGuardEarnings();
      setEarningsData(response.data);
    } catch (err) {
      console.error("Error loading earnings:", err);
      // Don't show error - earnings tracker is optional
    } finally {
      setEarningsLoading(false);
    }
  }

  async function loadPayStubs() {
    try {
      setPayStubsLoading(true);
      const response = await getPayStubs();
      // Handle both array and object responses
      const stubs = Array.isArray(response.data) ? response.data : (response.data?.rows || []);
      setPayStubs(stubs);
    } catch (err) {
      console.error("Error loading pay stubs:", err);
      // If endpoint doesn't exist or mode doesn't allow, just set empty array
      setPayStubs([]);
    } finally {
      setPayStubsLoading(false);
    }
  }

  const submit = async () => {
    setErr("");
    setAnswer("");
    setPayStubData(null); // Clear pay stub data on new question

    const q = question.trim();
    if (!q) return;
    
    // Check if question is about pay stubs/payroll (only show stub for relevant questions)
    const isPayStubRelated = /pay(stub|roll|check|wage|salary|earn|income|hours|gross|net|deduct|tax|amount|deposit)/i.test(q);

    setLoading(true);
    try {
      const res = await askPayroll({ question: q });
      const data = res?.data || {};
      
      
      // Handle response structure - backend now returns AI-generated answer
      let answerText = data.answer;
      
      // If no AI answer, fall back to context-based response
      if (!answerText && data.contextUsed) {
        // Backend is returning context structure - generate a basic response
        const ctx = data.contextUsed;
        const mode = ctx.mode || "PAYSTUB_UPLOAD";
        setPayrollMode(mode); // Store mode to use in render condition
        const hasStubs = ctx.currentStub || (ctx.stubHistory && ctx.stubHistory.length > 0);
        
        // Store pay stub data for display - simple check: if currentStub exists (is truthy and not null)
        // Note: Backend returns currentStub as null if no stub exists, or as object if it exists
        const currentStub = ctx.currentStub;
        const stubHistory = ctx.stubHistory || [];
        
        
        // Only show pay stub if question is about payroll/pay stubs AND we're in the right mode
        if ((mode === "PAYSTUB_UPLOAD" || mode === "HYBRID") && isPayStubRelated) {
          // Validate currentStub has actual data (not just empty object)
          const hasValidCurrentStub = currentStub && 
            currentStub !== null && 
            currentStub !== undefined &&
            (currentStub.id || currentStub.net_amount !== undefined || currentStub.pay_date);

          if (hasValidCurrentStub) {
            // currentStub is an object with data
            const stubData = {
              current: currentStub,
              history: Array.isArray(stubHistory) ? stubHistory : [],
            };
            setPayStubData(stubData);
          } else if (Array.isArray(stubHistory) && stubHistory.length > 0) {
            // Validate first history item has actual data
            const firstStub = stubHistory[0];
            if (firstStub && (firstStub.id || firstStub.net_amount !== undefined || firstStub.pay_date)) {
              const stubData = {
                current: firstStub,
                history: stubHistory,
              };
              setPayStubData(stubData);
            } else {
              setPayStubData(null);
            }
          } else {
            // No pay stubs at all
            setPayStubData(null);
          }
        } else {
          // Not pay stub related question or wrong mode - don't show pay stub
          setPayStubData(null);
        }
        
        // Only mention pay stubs if question is about payroll/pay stubs
        if (mode === "PAYSTUB_UPLOAD" || mode === "HYBRID") {
          if (isPayStubRelated) {
            if (hasStubs) {
              answerText = `I found your pay stub information for the most recent pay period. See the details below.\n\n` +
                `(AI payroll agent integration pending - this is basic data extraction from your pay stub.)`;
            } else {
              answerText = `I don't see any pay stubs in your account yet. Your payroll mode is ${mode}. Please contact your administrator if you expect to see pay stub information.`;
            }
          } else {
            // Not a payroll-related question - give generic response
            answerText = `Hello! I'm AGENT 24, your payroll assistant. How can I help you with your payroll questions?`;
          }
        } else {
          // CALCULATED mode
          if (isPayStubRelated) {
            answerText = `Your payroll mode is ${mode}. Calculated payroll features are available. What would you like to know about your payroll?`;
          } else {
            answerText = `Hello! I'm AGENT 24, your payroll assistant. How can I help you with your payroll questions?`;
          }
        }
      }
      
      setAnswer(answerText || "No answer received");
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
        {/* Earnings Tracker Section */}
        {showEarningsTracker && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>💰 Earnings Tracker</h2>
              <button
                className="btn"
                onClick={() => setShowEarningsTracker(false)}
                style={{ fontSize: 12, padding: "6px 12px" }}
              >
                Hide
              </button>
            </div>

            {earningsLoading ? (
              <div style={{ padding: 20, textAlign: "center" }}>Loading earnings data...</div>
            ) : earningsData ? (
              <EarningsTrackerSection data={earningsData} />
            ) : (
              <div style={{ padding: 20, textAlign: "center", opacity: 0.6 }}>
                Earnings data not available
              </div>
            )}
          </div>
        )}

        {/* Show Earnings Tracker Button if Hidden */}
        {!showEarningsTracker && (
          <div style={{ marginBottom: 16 }}>
            <button
              className="btn"
              onClick={() => setShowEarningsTracker(true)}
              style={{ width: "100%" }}
            >
              💰 Show Earnings Tracker
            </button>
          </div>
        )}

        {/* Pay Stubs Section */}
        {showPayStubs && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>📄 My Pay Stubs</h2>
              <button
                className="btn"
                onClick={() => setShowPayStubs(false)}
                style={{ fontSize: 12, padding: "6px 12px" }}
              >
                Hide
              </button>
            </div>

            {payStubsLoading ? (
              <div style={{ padding: 20, textAlign: "center" }}>Loading pay stubs...</div>
            ) : payStubs && payStubs.length > 0 ? (
              <PayStubsList payStubs={payStubs} />
            ) : (
              <div style={{ padding: 20, textAlign: "center", opacity: 0.6 }}>
                No pay stubs available yet. Pay stubs will appear here once your administrator uploads them.
              </div>
            )}
          </div>
        )}

        {/* Show Pay Stubs Button if Hidden */}
        {!showPayStubs && (
          <div style={{ marginBottom: 16 }}>
            <button
              className="btn"
              onClick={() => setShowPayStubs(true)}
              style={{ width: "100%" }}
            >
              📄 Show Pay Stubs
            </button>
          </div>
        )}

        <div className="card">
          <h2>Payroll Assistant</h2>

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
            <div style={{ fontSize: 18, fontWeight: 500 }}>
              {displayedText}
              {displayedText.length < fullText.length && <span className="agent-cursor" />}
            </div>
          </div>

          {/* Question Input */}
          <div style={{ marginBottom: 16 }}>
            <textarea
              placeholder="Ask about your pay stub, hours, deductions, or payroll questions..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  submit();
                }
              }}
              disabled={loading}
              style={{
                width: "100%",
                minHeight: 100,
                padding: 12,
                borderRadius: 8,
                border: "1px solid #ccc",
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              Press Cmd/Ctrl + Enter to submit
            </div>
          </div>

          {/* Submit Button */}
          <button
            className="btnPrimary"
            onClick={submit}
            disabled={loading || !question.trim()}
            style={{ width: "100%", marginBottom: 16 }}
          >
            {loading ? "Asking..." : "Ask Payroll Question"}
          </button>

          {/* Error Message */}
          {err ? (
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
              {err}
            </div>
          ) : null}

          {/* Pay Stub Data Display - Separate Card - Only show in PAYSTUB_UPLOAD or HYBRID mode */}
          {payStubData?.current && (payrollMode === "PAYSTUB_UPLOAD" || payrollMode === "HYBRID") ? (
            <div
              style={{
                padding: 20,
                borderRadius: 8,
                backgroundColor: "#e8f4f8",
                border: "2px solid #4a90e2",
                marginTop: 16,
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 600, color: "#2c3e50", fontSize: 18 }}>
                  📄 Current Pay Stub
                </div>
                {payStubData.current.file_url ? (
                  <a
                    href={`${getGuardApiUrl()}${payStubData.current.file_url}`}
                    download={payStubData.current.file_name || "paystub.pdf"}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: "8px 16px",
                      backgroundColor: "#4a90e2",
                      color: "white",
                      borderRadius: 6,
                      textDecoration: "none",
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onMouseOver={(e) => {
                      e.target.style.backgroundColor = "#357abd";
                    }}
                    onMouseOut={(e) => {
                      e.target.style.backgroundColor = "#4a90e2";
                    }}
                  >
                    ⬇️ Download PDF
                  </a>
                ) : null}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#555" }}>Pay Period:</span>
                  <span style={{ fontWeight: 600 }}>
                    {payStubData.current.pay_period_start} to {payStubData.current.pay_period_end}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#555" }}>Pay Date:</span>
                  <span style={{ fontWeight: 600 }}>{payStubData.current.pay_date}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#555" }}>Hours Worked:</span>
                  <span style={{ fontWeight: 600 }}>{payStubData.current.hours_worked || 0}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid #ccc" }}>
                  <span style={{ color: "#555" }}>Gross Amount:</span>
                  <span style={{ fontWeight: 600, color: "#27ae60" }}>
                    ${parseFloat(payStubData.current.gross_amount || 0).toFixed(2)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#555" }}>Tax Amount:</span>
                  <span style={{ fontWeight: 600, color: "#e74c3c" }}>
                    -${parseFloat(payStubData.current.tax_amount || 0).toFixed(2)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#555" }}>Deductions:</span>
                  <span style={{ fontWeight: 600, color: "#e74c3c" }}>
                    -${parseFloat(payStubData.current.deductions_amount || 0).toFixed(2)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "2px solid #2c3e50", marginTop: 8 }}>
                  <span style={{ color: "#2c3e50", fontWeight: 700, fontSize: 16 }}>Net Amount:</span>
                  <span style={{ fontWeight: 700, fontSize: 18, color: "#27ae60" }}>
                    ${parseFloat(payStubData.current.net_amount || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Answer Display */}
          {answer ? (
            <div
              style={{
                padding: 16,
                borderRadius: 8,
                backgroundColor: "#f8f9fa",
                border: "1px solid #e9ecef",
                marginTop: 16,
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8, color: "#333" }}>Answer:</div>
              <div style={{ color: "#555" }}>{answer}</div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

// Earnings Tracker Section Component
function EarningsTrackerSection({ data }) {
  const { realTimeEarnings, payPeriodSummaries, taxEstimates, paymentHistory } = data;

  return (
    <div>
      {/* Real-Time Earnings */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>Real-Time Earnings</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <EarningsCard
            title="This Week"
            hours={realTimeEarnings?.thisWeek?.hours || 0}
            earnings={realTimeEarnings?.thisWeek?.estimatedEarnings || 0}
          />
          <EarningsCard
            title="This Month"
            hours={realTimeEarnings?.thisMonth?.hours || 0}
            earnings={realTimeEarnings?.thisMonth?.estimatedEarnings || 0}
          />
          <EarningsCard
            title="This Year"
            hours={realTimeEarnings?.thisYear?.hours || 0}
            earnings={realTimeEarnings?.thisYear?.estimatedEarnings || 0}
          />
          <EarningsCard
            title="Total"
            hours={realTimeEarnings?.total?.hours || 0}
            earnings={realTimeEarnings?.total?.estimatedEarnings || 0}
          />
        </div>
      </div>

      {/* Pay Period Summary */}
      {payPeriodSummaries?.current && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>Current Pay Period</h3>
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Period</div>
                <div style={{ fontWeight: 600 }}>
                  {payPeriodSummaries.current.start} to {payPeriodSummaries.current.end}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Hours</div>
                <div style={{ fontWeight: 600 }}>{payPeriodSummaries.current.hours} hrs</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Estimated Earnings</div>
                <div style={{ fontWeight: 600, color: "#22c55e" }}>
                  ${payPeriodSummaries.current.estimatedEarnings.toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Status</div>
                <div style={{ fontWeight: 600 }}>
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      background:
                        payPeriodSummaries.current.status === "OPEN"
                          ? "rgba(34, 197, 94, 0.2)"
                          : "rgba(100, 116, 139, 0.2)",
                      color:
                        payPeriodSummaries.current.status === "OPEN" ? "#22c55e" : "#64748b",
                    }}
                  >
                    {payPeriodSummaries.current.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tax Estimates */}
      {taxEstimates && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>Tax Withholding Estimates</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
            <TaxEstimateCard
              title="This Month"
              gross={taxEstimates.thisMonth?.gross || 0}
              tax={taxEstimates.thisMonth?.estimatedTax || 0}
              net={taxEstimates.thisMonth?.estimatedNet || 0}
              taxRate={taxEstimates.averageTaxRate || 0}
            />
            <TaxEstimateCard
              title="This Year"
              gross={taxEstimates.thisYear?.gross || 0}
              tax={taxEstimates.thisYear?.estimatedTax || 0}
              net={taxEstimates.thisYear?.estimatedNet || 0}
              taxRate={taxEstimates.averageTaxRate || 0}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
            * Tax rate estimated from historical pay stubs ({taxEstimates.averageTaxRate?.toFixed(1)}% average)
          </div>
        </div>
      )}

      {/* Payment History */}
      {paymentHistory && paymentHistory.length > 0 && (
        <div>
          <h3 style={{ marginBottom: 12, fontSize: 18, fontWeight: 600 }}>Payment History</h3>
          <div style={{ maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid rgba(148, 163, 184, 0.3)" }}>
                  <th style={{ padding: 12, textAlign: "left", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
                    Pay Date
                  </th>
                  <th style={{ padding: 12, textAlign: "left", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
                    Period
                  </th>
                  <th style={{ padding: 12, textAlign: "right", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
                    Hours
                  </th>
                  <th style={{ padding: 12, textAlign: "right", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
                    Gross
                  </th>
                  <th style={{ padding: 12, textAlign: "right", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
                    Tax
                  </th>
                  <th style={{ padding: 12, textAlign: "right", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
                    Net
                  </th>
                  <th style={{ padding: 12, textAlign: "center", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
                    PDF
                  </th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((payment) => (
                  <tr
                    key={payment.id}
                    style={{
                      borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
                    }}
                  >
                    <td style={{ padding: 12, fontSize: 14 }}>
                      {payment.payDate
                        ? new Date(payment.payDate).toLocaleDateString()
                        : "—"}
                    </td>
                    <td style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
                      {payment.payPeriodStart && payment.payPeriodEnd
                        ? `${new Date(payment.payPeriodStart).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })} - ${new Date(payment.payPeriodEnd).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}`
                        : "—"}
                    </td>
                    <td style={{ padding: 12, textAlign: "right", fontSize: 14 }}>
                      {payment.hoursWorked.toFixed(1)}
                    </td>
                    <td style={{ padding: 12, textAlign: "right", fontSize: 14, fontWeight: 600 }}>
                      ${payment.grossAmount.toFixed(2)}
                    </td>
                    <td style={{ padding: 12, textAlign: "right", fontSize: 14, color: "#ef4444" }}>
                      -${payment.taxAmount.toFixed(2)}
                    </td>
                    <td style={{ padding: 12, textAlign: "right", fontSize: 14, fontWeight: 700, color: "#22c55e" }}>
                      ${payment.netAmount.toFixed(2)}
                    </td>
                    <td style={{ padding: 12, textAlign: "center" }}>
                      {payment.fileUrl ? (
                        <a
                          href={`${getGuardApiUrl()}${payment.fileUrl}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: "4px 8px",
                            borderRadius: 4,
                            background: "#3b82f6",
                            color: "white",
                            textDecoration: "none",
                            fontSize: 11,
                          }}
                        >
                          View
                        </a>
                      ) : (
                        <span style={{ opacity: 0.3 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!paymentHistory || paymentHistory.length === 0) && (
        <div style={{ padding: 20, textAlign: "center", opacity: 0.6 }}>
          No payment history available yet
        </div>
      )}
    </div>
  );
}

function EarningsCard({ title, hours, earnings }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        background: "rgba(15, 23, 42, 0.5)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: "#22c55e" }}>
        ${earnings.toFixed(2)}
      </div>
      <div style={{ fontSize: 14, opacity: 0.6 }}>{hours.toFixed(1)} hours</div>
    </div>
  );
}

function TaxEstimateCard({ title, gross, tax, net, taxRate }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        background: "rgba(15, 23, 42, 0.5)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{title}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Gross:</span>
        <span style={{ fontWeight: 600 }}>${gross.toFixed(2)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Tax ({taxRate.toFixed(1)}%):</span>
        <span style={{ color: "#ef4444", fontWeight: 600 }}>-${tax.toFixed(2)}</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingTop: 8,
          borderTop: "1px solid rgba(148, 163, 184, 0.2)",
          marginTop: 8,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>Net:</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>${net.toFixed(2)}</span>
      </div>
    </div>
  );
}

// Pay Stubs List Component
function PayStubsList({ payStubs }) {
  return (
    <div>
      <div style={{ maxHeight: 600, overflowY: "auto" }}>
        {payStubs.map((stub, index) => (
          <div
            key={stub.id || index}
            style={{
              padding: 20,
              borderRadius: 8,
              backgroundColor: index === 0 ? "#e8f4f8" : "#f8f9fa",
              border: index === 0 ? "2px solid #4a90e2" : "1px solid rgba(148, 163, 184, 0.2)",
              marginBottom: 16,
              boxShadow: index === 0 ? "0 2px 4px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {index === 0 && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#4a90e2",
                  marginBottom: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Most Recent
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "#2c3e50" }}>
                  Pay Stub #{payStubs.length - index}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Pay Date</div>
                    <div style={{ fontWeight: 600 }}>
                      {stub.pay_date
                        ? new Date(stub.pay_date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Pay Period</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {stub.pay_period_start && stub.pay_period_end
                        ? `${new Date(stub.pay_period_start).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })} - ${new Date(stub.pay_period_end).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Hours Worked</div>
                    <div style={{ fontWeight: 600 }}>{stub.hours_worked || 0} hrs</div>
                  </div>
                </div>
              </div>
              {stub.file_url && (
                <a
                  href={`${getGuardApiUrl()}${stub.file_url}`}
                  download={stub.file_name || "paystub.pdf"}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#4a90e2",
                    color: "white",
                    borderRadius: 6,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                  onMouseOver={(e) => {
                    e.target.style.backgroundColor = "#357abd";
                  }}
                  onMouseOut={(e) => {
                    e.target.style.backgroundColor = "#4a90e2";
                  }}
                >
                  ⬇️ Download PDF
                </a>
              )}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
                paddingTop: 12,
                borderTop: "1px solid rgba(148, 163, 184, 0.2)",
                marginTop: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Gross Amount</div>
                <div style={{ fontWeight: 600, color: "#22c55e", fontSize: 16 }}>
                  ${parseFloat(stub.gross_amount || 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Tax</div>
                <div style={{ fontWeight: 600, color: "#ef4444" }}>
                  -${parseFloat(stub.tax_amount || 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Deductions</div>
                <div style={{ fontWeight: 600, color: "#ef4444" }}>
                  -${parseFloat(stub.deductions_amount || 0).toFixed(2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Net Amount</div>
                <div style={{ fontWeight: 700, color: "#22c55e", fontSize: 18 }}>
                  ${parseFloat(stub.net_amount || 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
