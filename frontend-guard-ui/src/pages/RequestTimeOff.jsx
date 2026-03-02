// src/pages/RequestTimeOff.jsx
import React, { useState, useMemo } from "react";
import NavBar from "../components/NavBar";
import "./home.css";

export default function RequestTimeOff() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("personal");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Calculate total days
  const totalDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    if (end < start) return 0;
    
    // Calculate difference in days (inclusive of both start and end dates)
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    return diffDays;
  }, [startDate, endDate]);

  // Set minimum date to today
  const today = new Date().toISOString().split("T")[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!startDate) {
      setErr("Please select a start date");
      return;
    }

    if (!endDate) {
      setErr("Please select an end date");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setErr("Invalid date format");
      return;
    }

    if (end < start) {
      setErr("End date must be after or equal to start date");
      return;
    }

    if (!reason) {
      setErr("Please select a reason for your request");
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement API call to submit time off request
      // For now, just show success message
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      setMsg("Time off request submitted successfully!");
      
      // Reset form after successful submission
      setTimeout(() => {
        setStartDate("");
        setEndDate("");
        setReason("personal");
        setMsg("");
      }, 2000);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to submit time off request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="welcomeWrap" style={{ marginBottom: 20 }}>
          <div className="welcomeGlow" />
          <div className="welcomeText">Request For Time Off</div>
        </div>

        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div className="card">
            <h3>Submit Time Off Request</h3>
            
            {err ? <div className="error">{err}</div> : null}
            {msg ? <div className="success">{msg}</div> : null}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 18 }}>
                <label className="muted" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                  Start Date *
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    // If end date is before new start date, clear it
                    if (endDate && e.target.value && new Date(e.target.value) > new Date(endDate)) {
                      setEndDate("");
                    }
                  }}
                  min={today}
                  required
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--text)",
                  }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className="muted" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                  End Date *
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || today}
                  required
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--text)",
                  }}
                />
              </div>

              <div style={{ marginBottom: 18 }}>
                <label className="muted" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                  Total Number of Days
                </label>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--text)",
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  {totalDays > 0 ? `${totalDays} day${totalDays !== 1 ? "s" : ""}` : "—"}
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label className="muted" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                  Reason for Request *
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    background: "rgba(255,255,255,0.04)",
                    color: "var(--text)",
                  }}
                >
                  <option value="personal">Personal</option>
                  <option value="vacation">Vacation</option>
                  <option value="leave_of_absence">Leave of Absence</option>
                  <option value="sick">Sick</option>
                </select>
              </div>

              <div className="row">
                <button
                  type="submit"
                  className="btnPrimary"
                  disabled={loading || !startDate || !endDate || !reason}
                  style={{ flex: 1 }}
                >
                  {loading ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
