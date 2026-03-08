import React, { useEffect, useState, useMemo } from "react";
import Card from "../components/Card";
import Modal from "../components/Modal";
import {
  getTenantPayrollSettings,
  updateTenantPayrollSettings,
  askPayroll,
  uploadPayStub,
  listPayStubs,
  listPendingAdjustments,
  approveAdjustment,
  rejectAdjustment,
  listGuards,
} from "../services/payroll.service";
import { getAdminInfo } from "../utils/access";
import { getGuardAiOrigin } from "../api/apiOrigin";

export default function Payroll() {
  const adminInfo = getAdminInfo();
  const tenantId = adminInfo?.tenant_id;

  // Tenant settings
  const [payrollMode, setPayrollMode] = useState("PAYSTUB_UPLOAD");
  const [aiPayrollEnabled, setAiPayrollEnabled] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);

  // AI Payroll Assistant
  const [question, setQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Pay Stub Upload
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadGuardId, setUploadGuardId] = useState("");
  const [uploadPayPeriodStart, setUploadPayPeriodStart] = useState("");
  const [uploadPayPeriodEnd, setUploadPayPeriodEnd] = useState("");
  const [uploadPayDate, setUploadPayDate] = useState("");
  const [uploadPaymentMethod, setUploadPaymentMethod] = useState("DIRECT_DEPOSIT");
  const [uploadHours, setUploadHours] = useState("");
  const [uploadGross, setUploadGross] = useState("");
  const [uploadTax, setUploadTax] = useState("");
  const [uploadDeductions, setUploadDeductions] = useState("");
  const [uploadNet, setUploadNet] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);

  // Adjustments
  const [pendingAdjustments, setPendingAdjustments] = useState([]);
  const [loadingAdjustments, setLoadingAdjustments] = useState(false);

  // Guards dropdown
  const [guards, setGuards] = useState([]);

  // Pay stubs list
  const [payStubs, setPayStubs] = useState([]);

  useEffect(() => {
    if (tenantId) {
      loadSettings();
      loadPendingAdjustments();
      loadGuards();
      loadPayStubs();
    }
  }, [tenantId]);

  async function loadSettings() {
    if (!tenantId) return;
    try {
      const res = await getTenantPayrollSettings(tenantId);
      if (res.data) {
        setPayrollMode(res.data.payroll_mode || "PAYSTUB_UPLOAD");
        setAiPayrollEnabled(res.data.ai_payroll_enabled ?? true);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }

  async function loadPendingAdjustments() {
    setLoadingAdjustments(true);
    try {
      const res = await listPendingAdjustments();
      setPendingAdjustments(res.data || []);
    } catch (err) {
      console.error("Failed to load adjustments:", err);
    } finally {
      setLoadingAdjustments(false);
    }
  }

  async function loadGuards() {
    try {
      const res = await listGuards();
      setGuards(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load guards:", err);
    }
  }

  async function loadPayStubs() {
    try {
      const res = await listPayStubs();
      setPayStubs(res.data || []);
    } catch (err) {
      console.error("Failed to load pay stubs:", err);
    }
  }

  async function handleUpdateSettings() {
    if (!tenantId) return;
    setLoadingSettings(true);
    try {
      await updateTenantPayrollSettings(tenantId, {
        payroll_mode: payrollMode,
        ai_payroll_enabled: aiPayrollEnabled,
      });
      alert("Settings updated successfully!");
    } catch (err) {
      alert("Failed to update settings: " + (err.response?.data?.message || err.message));
    } finally {
      setLoadingSettings(false);
    }
  }

  async function handleAskPayroll() {
    if (!question.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiAnswer("");

    try {
      const res = await askPayroll({ question: question.trim() });
      const ctx = res.data?.contextUsed || {};
      
      let answer = "";
      if (res.data?.answer) {
        answer = res.data.answer;
      } else if (ctx.calculatedPayroll || ctx.currentStub) {
        answer = "I've processed your payroll data. Here's what I found:\n\n";
        if (ctx.calculatedPayroll?.timesheet) {
          const ts = ctx.calculatedPayroll.timesheet;
          answer += `📊 Current Timesheet:\n`;
          answer += `   - Total Hours: ${ts.totalHours || 0}\n`;
          answer += `   - Regular: ${ts.regularHours || 0} | OT: ${ts.overtimeHours || 0} | Double-Time: ${ts.doubleTimeHours || 0}\n`;
          answer += `   - Status: ${ts.status || "DRAFT"}\n`;
          if (ts.exceptionsCount > 0) {
            answer += `   - ⚠️ ${ts.exceptionsCount} exception(s) detected\n`;
          }
        }
        if (ctx.currentStub) {
          answer += `\n💰 Pay Stub:\n`;
          answer += `   - Net Amount: $${parseFloat(ctx.currentStub.net_amount || 0).toFixed(2)}\n`;
          answer += `   - Gross: $${parseFloat(ctx.currentStub.gross_amount || 0).toFixed(2)}\n`;
        }
      } else {
        answer = "I processed your request. (AI payroll agent integration pending - this is basic data extraction.)";
      }
      
      setAiAnswer(answer);
    } catch (err) {
      setAiError(err.response?.data?.message || err.message || "Failed to get answer");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleUploadPayStub(e) {
    e.preventDefault();
    if (!uploadFile || !uploadGuardId || !uploadPayPeriodStart || !uploadPayPeriodEnd || !uploadPayDate) {
      alert("Please fill in all required fields");
      return;
    }

    setUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("guard_id", uploadGuardId);
      formData.append("pay_period_start", uploadPayPeriodStart);
      formData.append("pay_period_end", uploadPayPeriodEnd);
      formData.append("pay_date", uploadPayDate);
      formData.append("payment_method", uploadPaymentMethod);
      formData.append("hours_worked", uploadHours || "0");
      formData.append("gross_amount", uploadGross || "0");
      formData.append("tax_amount", uploadTax || "0");
      formData.append("deductions_amount", uploadDeductions || "0");
      formData.append("net_amount", uploadNet || "0");

      await uploadPayStub(formData);
      alert("Pay stub uploaded successfully!");
      setUploadModalOpen(false);
      setUploadFile(null);
      setUploadGuardId("");
      setUploadPayPeriodStart("");
      setUploadPayPeriodEnd("");
      setUploadPayDate("");
      setUploadHours("");
      setUploadGross("");
      setUploadTax("");
      setUploadDeductions("");
      setUploadNet("");
      loadPayStubs();
    } catch (err) {
      alert("Failed to upload pay stub: " + (err.response?.data?.message || err.message));
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleApproveAdjustment(adjustmentId) {
    try {
      await approveAdjustment(adjustmentId);
      alert("Adjustment approved!");
      loadPendingAdjustments();
    } catch (err) {
      alert("Failed to approve: " + (err.response?.data?.message || err.message));
    }
  }

  async function handleRejectAdjustment(adjustmentId) {
    if (!confirm("Are you sure you want to reject this adjustment?")) return;
    try {
      await rejectAdjustment(adjustmentId);
      alert("Adjustment rejected!");
      loadPendingAdjustments();
    } catch (err) {
      alert("Failed to reject: " + (err.response?.data?.message || err.message));
    }
  }

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  return (
    <div style={{ padding: "24px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>💰 Payroll Management</h1>

      {/* Settings Card */}
      <Card style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Payroll Settings</h2>
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
              Payroll Mode
            </label>
            <select
              value={payrollMode}
              onChange={(e) => setPayrollMode(e.target.value)}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
            >
              <option value="PAYSTUB_UPLOAD">Pay Stub Upload Only (Mode A)</option>
              <option value="CALCULATED">Calculated Payroll Only (Mode B)</option>
              <option value="HYBRID">Hybrid (Both Modes)</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ fontWeight: 500 }}>AI Payroll Assistant Enabled</label>
            <button
              type="button"
              onClick={() => setAiPayrollEnabled(!aiPayrollEnabled)}
              style={{
                width: 48,
                height: 24,
                borderRadius: 12,
                border: "none",
                background: aiPayrollEnabled ? "#22c55e" : "#ccc",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: aiPayrollEnabled ? 26 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 0.2s",
                }}
              />
            </button>
            <span style={{ fontSize: 14, color: "#666" }}>
              {aiPayrollEnabled ? "On" : "Off"}
            </span>
          </div>

          <button
            onClick={handleUpdateSettings}
            disabled={loadingSettings}
            style={{
              padding: "10px 20px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: loadingSettings ? "not-allowed" : "pointer",
              opacity: loadingSettings ? 0.6 : 1,
            }}
          >
            {loadingSettings ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </Card>

      {/* AI Payroll Assistant */}
      {aiPayrollEnabled && (
        <Card style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>🤖 AI Payroll Assistant</h2>
          <div style={{ display: "grid", gap: 12 }}>
            <textarea
              placeholder="Ask about payroll, timesheets, hours, or adjustments..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleAskPayroll();
                }
              }}
              disabled={aiLoading}
              style={{
                width: "100%",
                minHeight: 100,
                padding: 12,
                borderRadius: 8,
                border: "1px solid #ccc",
                fontSize: 14,
              }}
            />
            <button
              onClick={handleAskPayroll}
              disabled={aiLoading || !question.trim()}
              style={{
                padding: "10px 20px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontWeight: 600,
                cursor: aiLoading || !question.trim() ? "not-allowed" : "pointer",
                opacity: aiLoading || !question.trim() ? 0.6 : 1,
              }}
            >
              {aiLoading ? "Asking..." : "Ask Question"}
            </button>

            {aiError && (
              <div style={{ padding: 12, background: "#fee", color: "#c00", borderRadius: 6 }}>
                {aiError}
              </div>
            )}

            {aiAnswer && (
              <div style={{ padding: 16, background: "#f8f9fa", borderRadius: 8, whiteSpace: "pre-wrap" }}>
                <strong>Answer:</strong>
                <div style={{ marginTop: 8, color: "#333" }}>{aiAnswer}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Pending Adjustments */}
      <Card style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
          ⚠️ Pending Adjustments ({pendingAdjustments.length})
        </h2>
        {loadingAdjustments ? (
          <div>Loading...</div>
        ) : pendingAdjustments.length === 0 ? (
          <div style={{ color: "#666" }}>No pending adjustments</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {pendingAdjustments.map((adj) => (
              <div
                key={adj.id}
                style={{
                  padding: 16,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {adj.adjustment_type === "BONUS" ? "➕" : "➖"} ${Math.abs(parseFloat(adj.amount)).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 14, color: "#666", marginTop: 4 }}>
                    {adj.description}
                  </div>
                  {adj.suggested_by_ai && (
                    <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 4 }}>
                      🤖 AI Suggested: {adj.ai_suggestion_reason || "No reason provided"}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleApproveAdjustment(adj.id)}
                    style={{
                      padding: "8px 16px",
                      background: "#22c55e",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleRejectAdjustment(adj.id)}
                    style={{
                      padding: "8px 16px",
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pay Stubs & Upload */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>📄 Pay Stubs</h2>
          <button
            onClick={() => setUploadModalOpen(true)}
            style={{
              padding: "8px 16px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Upload Pay Stub
          </button>
        </div>

        {payStubs.length === 0 ? (
          <div style={{ color: "#666" }}>No pay stubs uploaded yet</div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {payStubs.slice(0, 10).map((stub) => (
              <div
                key={stub.id}
                style={{
                  padding: 12,
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    ${parseFloat(stub.net_amount || 0).toFixed(2)} - {stub.pay_date}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {stub.pay_period_start} to {stub.pay_period_end}
                  </div>
                </div>
                {stub.file_url && (
                  <a
                    href={getGuardAiOrigin() ? `${getGuardAiOrigin()}${stub.file_url}` : stub.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#3b82f6", textDecoration: "none" }}
                  >
                    View PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Upload Modal */}
      {uploadModalOpen && (
        <Modal title="Upload Pay Stub" onClose={() => setUploadModalOpen(false)}>
        <form onSubmit={handleUploadPayStub}>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Guard *
              </label>
              <select
                value={uploadGuardId}
                onChange={(e) => setUploadGuardId(e.target.value)}
                required
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              >
                <option value="">Select Guard</option>
                {guards.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Pay Period Start *
              </label>
              <input
                type="date"
                value={uploadPayPeriodStart}
                onChange={(e) => setUploadPayPeriodStart(e.target.value)}
                required
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Pay Period End *
              </label>
              <input
                type="date"
                value={uploadPayPeriodEnd}
                onChange={(e) => setUploadPayPeriodEnd(e.target.value)}
                required
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Pay Date *
              </label>
              <input
                type="date"
                value={uploadPayDate}
                onChange={(e) => setUploadPayDate(e.target.value)}
                required
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Payment Method *
              </label>
              <select
                value={uploadPaymentMethod}
                onChange={(e) => setUploadPaymentMethod(e.target.value)}
                required
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              >
                <option value="DIRECT_DEPOSIT">Direct Deposit</option>
                <option value="CHECK">Check</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Hours Worked
              </label>
              <input
                type="number"
                step="0.01"
                value={uploadHours}
                onChange={(e) => setUploadHours(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Gross Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={uploadGross}
                onChange={(e) => setUploadGross(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Tax Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={uploadTax}
                onChange={(e) => setUploadTax(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Deductions
              </label>
              <input
                type="number"
                step="0.01"
                value={uploadDeductions}
                onChange={(e) => setUploadDeductions(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                Net Amount
              </label>
              <input
                type="number"
                step="0.01"
                value={uploadNet}
                onChange={(e) => setUploadNet(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
                PDF File *
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setUploadFile(e.target.files[0])}
                required
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="submit"
                disabled={uploadLoading}
                style={{
                  flex: 1,
                  padding: "10px 20px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: uploadLoading ? "not-allowed" : "pointer",
                  opacity: uploadLoading ? 0.6 : 1,
                }}
              >
                {uploadLoading ? "Uploading..." : "Upload"}
              </button>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                style={{
                  padding: "10px 20px",
                  background: "#ccc",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
        </Modal>
      )}
    </div>
  );
}
