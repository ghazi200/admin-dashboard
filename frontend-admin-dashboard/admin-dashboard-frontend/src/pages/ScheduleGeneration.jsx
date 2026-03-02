import React, { useState } from "react";
import Card from "../components/Card";
import { generateSchedule, generateScheduleFromTemplate } from "../services/api";
import { hasAccess } from "../utils/access";

export default function ScheduleGeneration() {
  const canWrite = hasAccess("shifts:write");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [results, setResults] = useState(null);

  const [form, setForm] = useState({
    tenantId: "",
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    timeSlots: [
      { start: "08:00", end: "16:00", location: "", minGuards: 1, maxGuards: 1 }
    ],
    constraints: {
      autoAssign: true,
      minScore: 60,
      excludeWeekends: false,
      excludeHolidays: false
    },
    repeatWeekly: false,
    weeksToRepeat: 1
  });

  if (!canWrite) {
    return (
      <div style={{ padding: 24 }}>
        <Card>
          <div style={{ textAlign: "center", padding: 40 }}>
            <h2>Access Denied</h2>
            <p>You don't have permission to generate schedules.</p>
          </div>
        </Card>
      </div>
    );
  }

  const addTimeSlot = () => {
    setForm({
      ...form,
      timeSlots: [
        ...form.timeSlots,
        { start: "08:00", end: "16:00", location: "", minGuards: 1, maxGuards: 1 }
      ]
    });
  };

  const removeTimeSlot = (index) => {
    setForm({
      ...form,
      timeSlots: form.timeSlots.filter((_, i) => i !== index)
    });
  };

  const updateTimeSlot = (index, field, value) => {
    const newTimeSlots = [...form.timeSlots];
    newTimeSlots[index] = { ...newTimeSlots[index], [field]: value };
    setForm({ ...form, timeSlots: newTimeSlots });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    setResults(null);

    try {
      let response;
      if (form.repeatWeekly) {
        response = await generateScheduleFromTemplate({
          tenantId: form.tenantId,
          name: `Generated Schedule - ${form.startDate} to ${form.endDate}`,
          startDate: form.startDate,
          endDate: form.endDate,
          timeSlots: form.timeSlots,
          constraints: form.constraints,
          repeatWeekly: true,
          weeksToRepeat: form.weeksToRepeat
        });
      } else {
        response = await generateSchedule({
          tenantId: form.tenantId,
          startDate: form.startDate,
          endDate: form.endDate,
          timeSlots: form.timeSlots,
          constraints: form.constraints
        });
      }

      setResults(response.data.results);
      setSuccess(response.data.message);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to generate schedule");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <h1 style={{ marginBottom: 24 }}>🤖 Automatic Schedule Generation</h1>

        {error && (
          <div style={{
            padding: 12,
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 8,
            marginBottom: 16,
            color: "#ef4444"
          }}>
            ❌ {error}
          </div>
        )}

        {success && (
          <div style={{
            padding: 12,
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            borderRadius: 8,
            marginBottom: 16,
            color: "#22c55e"
          }}>
            ✅ {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
              Tenant ID *
            </label>
            <input
              type="text"
              value={form.tenantId}
              onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
              required
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "white"
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                Start Date *
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                End Date *
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                required
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.05)",
                  color: "white"
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <label style={{ fontWeight: 600 }}>Time Slots *</label>
              <button
                type="button"
                onClick={addTimeSlot}
                style={{
                  padding: "6px 12px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12
                }}
              >
                + Add Time Slot
              </button>
            </div>

            {form.timeSlots.map((slot, index) => (
              <div
                key={index}
                style={{
                  padding: 16,
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 8,
                  marginBottom: 12,
                  border: "1px solid rgba(255,255,255,0.1)"
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Start</label>
                    <input
                      type="time"
                      value={slot.start}
                      onChange={(e) => updateTimeSlot(index, "start", e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(255,255,255,0.05)",
                        color: "white"
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>End</label>
                    <input
                      type="time"
                      value={slot.end}
                      onChange={(e) => updateTimeSlot(index, "end", e.target.value)}
                      required
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(255,255,255,0.05)",
                        color: "white"
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Location</label>
                    <input
                      type="text"
                      value={slot.location}
                      onChange={(e) => updateTimeSlot(index, "location", e.target.value)}
                      placeholder="Optional"
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(255,255,255,0.05)",
                        color: "white"
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Min Guards</label>
                    <input
                      type="number"
                      min="1"
                      value={slot.minGuards}
                      onChange={(e) => updateTimeSlot(index, "minGuards", parseInt(e.target.value) || 1)}
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(255,255,255,0.05)",
                        color: "white"
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>Max Guards</label>
                    <input
                      type="number"
                      min="1"
                      value={slot.maxGuards}
                      onChange={(e) => updateTimeSlot(index, "maxGuards", parseInt(e.target.value) || 1)}
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(255,255,255,0.05)",
                        color: "white"
                      }}
                    />
                  </div>
                  {form.timeSlots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTimeSlot(index)}
                      style={{
                        padding: "8px 12px",
                        background: "rgba(239, 68, 68, 0.2)",
                        color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.3)",
                        borderRadius: 6,
                        cursor: "pointer"
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={form.constraints.autoAssign}
                onChange={(e) => setForm({
                  ...form,
                  constraints: { ...form.constraints, autoAssign: e.target.checked }
                })}
              />
              <span>Auto-assign guards (uses AI optimization)</span>
            </label>
            {form.constraints.autoAssign && (
              <div style={{ marginLeft: 24, marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
                  Minimum Score (0-100)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.constraints.minScore}
                  onChange={(e) => setForm({
                    ...form,
                    constraints: { ...form.constraints, minScore: parseInt(e.target.value) || 60 }
                  })}
                  style={{
                    width: 200,
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.05)",
                    color: "white"
                  }}
                />
              </div>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={form.constraints.excludeWeekends}
                onChange={(e) => setForm({
                  ...form,
                  constraints: { ...form.constraints, excludeWeekends: e.target.checked }
                })}
              />
              <span>Exclude weekends</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.constraints.excludeHolidays}
                onChange={(e) => setForm({
                  ...form,
                  constraints: { ...form.constraints, excludeHolidays: e.target.checked }
                })}
              />
              <span>Exclude holidays</span>
            </label>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={form.repeatWeekly}
                onChange={(e) => setForm({ ...form, repeatWeekly: e.target.checked })}
              />
              <span>Repeat weekly</span>
            </label>
            {form.repeatWeekly && (
              <div style={{ marginLeft: 24 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
                  Number of weeks to repeat
                </label>
                <input
                  type="number"
                  min="1"
                  max="52"
                  value={form.weeksToRepeat}
                  onChange={(e) => setForm({ ...form, weeksToRepeat: parseInt(e.target.value) || 1 })}
                  style={{
                    width: 200,
                    padding: 8,
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.05)",
                    color: "white"
                  }}
                />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 24px",
              background: loading ? "rgba(59, 130, 246, 0.5)" : "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 16,
              fontWeight: 600
            }}
          >
            {loading ? "Generating..." : "🤖 Generate Schedule"}
          </button>
        </form>

        {results && (
          <div style={{ marginTop: 32, padding: 20, background: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
            <h2 style={{ marginBottom: 16 }}>Generation Results</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>
                  {results.totalShifts}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Total Shifts Created</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e" }}>
                  {results.assignedShifts?.length || 0}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Auto-Assigned</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>
                  {results.failedAssignments?.length || 0}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Failed Assignments</div>
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#ef4444" }}>
                  {results.skippedDates?.length || 0}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Skipped Dates</div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
