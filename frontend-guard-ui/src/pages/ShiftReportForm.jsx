import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import NavBar from "../components/NavBar";
import { useAuth } from "../auth/AuthContext";
import { submitShiftReport, getShiftReport } from "../services/shiftManagement.api";

export default function ShiftReportForm() {
  const { id: shiftId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const guardId = user?.id || user?.guard_id;
  
  const [form, setForm] = useState({
    notes: "",
    report_type: "incident",
    photos: [],
  });
  
  const [existingReport, setExistingReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Fetch existing report if any
  useEffect(() => {
    if (!shiftId || !guardId) return;
    
    setIsLoading(true);
    getShiftReport(shiftId)
      .then((res) => {
        const reportData = res?.data?.data || res?.data || null;
        if (reportData) {
          setExistingReport(reportData);
          setForm({
            notes: reportData.notes || "",
            report_type: reportData.report_type || "incident",
            photos: reportData.photos || [],
          });
        }
      })
      .catch((err) => {
        // 404 is okay - no existing report
        if (err.response?.status !== 404) {
          console.error("Failed to load report:", err);
          setError(err.response?.data?.message || "Failed to load report");
        }
      })
      .finally(() => setIsLoading(false));
  }, [shiftId, guardId]);

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    // In a real app, you'd upload these to S3/cloud storage first
    // For now, we'll just store file names
    setForm((prev) => ({
      ...prev,
      photos: [...prev.photos, ...files.map((f) => f.name)],
    }));
  };

  const removePhoto = (index) => {
    setForm((prev) => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!shiftId || !guardId) return;
    
    setSubmitting(true);
    try {
      await submitShiftReport(shiftId, form);
      alert("Report submitted successfully!");
      navigate("/shifts/history");
    } catch (err) {
      alert(`Failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (!guardId) {
    return (
      <div>
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>
          Please log in to submit a shift report.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <NavBar />
      <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 20 }}>
          {existingReport ? "Update Shift Report" : "Submit Shift Report"}
        </h2>
        
        {error && (
          <div style={{ padding: 12, background: "#fee", color: "#c33", borderRadius: 8, marginBottom: 20 }}>
            {error}
          </div>
        )}
        
        {existingReport && (
          <div style={{ padding: 12, background: "#eef", color: "#336", borderRadius: 8, marginBottom: 20 }}>
            You have already submitted a report for this shift. You can update it below.
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          {/* Report Type */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              Report Type
            </label>
            <select
              value={form.report_type}
              onChange={(e) => setForm((prev) => ({ ...prev, report_type: e.target.value }))}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
            >
              <option value="incident">Incident</option>
              <option value="maintenance">Maintenance</option>
              <option value="visitor_log">Visitor Log</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              rows={6}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
              placeholder="Describe what happened during this shift..."
              required
            />
          </div>

          {/* Photo Upload */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              Photos (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoChange}
              style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
            />
            {form.photos.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {form.photos.map((photo, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 8,
                      background: "#f0f0f0",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 12 }}>{typeof photo === "string" ? photo : photo.name}</span>
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: 16,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              Note: Photo upload to cloud storage will be implemented in production
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
              style={{ padding: "10px 20px" }}
            >
              {submitting ? "Submitting..." : existingReport ? "Update Report" : "Submit Report"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => navigate("/shifts/history")}
              style={{ padding: "10px 20px" }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
