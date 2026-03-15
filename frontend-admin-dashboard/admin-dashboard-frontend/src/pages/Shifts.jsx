import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/Card";
import ShiftOptimizationRecommendations from "../components/ShiftOptimizationRecommendations";
import {
  listShifts,
  createShift,
  updateShift,
  deleteShift,
  listGuards,
  getShiftRecommendations,
} from "../services/api";
import { hasAccess } from "../utils/access";

export default function Shifts() {
  const navigate = useNavigate();
  // Permissions
  const canWrite = hasAccess("shifts:write");
  const canDelete = hasAccess("shifts:delete");

  const [guards, setGuards] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    location: "",
    shiftDate: new Date().toISOString().split('T')[0], // Default to today
    startTime: "",
    endTime: "",
    assignedGuardId: "",
  });

  // AI Optimization state
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [lastCreatedShift, setLastCreatedShift] = useState(null);

  const canSubmit = useMemo(
    () => form.location.trim().length >= 2 && form.shiftDate && form.startTime && form.endTime,
    [form]
  );

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setErr("");

    try {
      const [g, s] = await Promise.all([listGuards(), listShifts()]);

      const guardsData = Array.isArray(g.data) ? g.data : g.data?.guards || [];
      const shiftsData = Array.isArray(s.data) ? s.data : s.data?.shifts || [];

      setGuards(guardsData);
      setShifts(shiftsData);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Failed to load shifts");
    } finally {
      setLoading(false);
    }
  }

  function onChange(e) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  }

  function startEdit(sh) {
    if (!canWrite) {
      setErr("You don’t have permission to edit shifts.");
      return;
    }

    setEditingId(sh.id);
    setForm({
      location: sh.location || "",
      shiftDate: sh.shiftDate || sh.shift_date || new Date().toISOString().split('T')[0],
      startTime: sh.startTime || sh.shift_start || "",
      endTime: sh.endTime || sh.shift_end || "",
      assignedGuardId: sh.assignedGuardId || sh.guard_id ? String(sh.assignedGuardId || sh.guard_id) : "",
    });
  }

  function reset() {
    setEditingId(null);
    setForm({
      location: "",
      shiftDate: new Date().toISOString().split('T')[0],
      startTime: "",
      endTime: "",
      assignedGuardId: "",
    });
    setShowRecommendations(false);
    setRecommendations([]);
    setLastCreatedShift(null);
  }

  // Load recommendations for a shift
  async function loadRecommendations(shiftId) {
    if (!shiftId) return;
    
    setRecommendationsLoading(true);
    setErr("");
    try {
      const response = await getShiftRecommendations(shiftId);
      const shift = shifts.find(s => s.id === shiftId);
      if (shift) {
        setLastCreatedShift({
          id: shiftId,
          ...shift
        });
      }
      setRecommendations(response.data.recommendations || []);
      setShowRecommendations(true);
    } catch (e) {
      console.error("Failed to load recommendations:", e);
      setErr(e?.response?.data?.message || "Failed to load recommendations");
    } finally {
      setRecommendationsLoading(false);
    }
  }

  function handleGuardAssigned() {
    setShowRecommendations(false);
    setRecommendations([]);
    load(); // Refresh shifts list
  }

  async function submit(e) {
    e.preventDefault();

    if (!canWrite) {
      setErr("You don’t have permission to create or edit shifts.");
      return;
    }

    if (!canSubmit) return;

    const payload = {
      location: form.location.trim(),
      shift_date: form.shiftDate,
      shift_start: form.startTime,
      shift_end: form.endTime,
      guard_id: form.assignedGuardId || null,
    };

    setErr("");

    try {
      if (editingId) {
        await updateShift(editingId, payload);
        reset();
        await load();
      } else {
        // Create shift
        const response = await createShift(payload);
        const createdShift = response.data;

        // If shift created without guard, show AI recommendations
        if (createdShift && !createdShift.guard_id && createdShift.aiRecommendations) {
          setLastCreatedShift(createdShift);
          setRecommendations(createdShift.aiRecommendations || []);
          setShowRecommendations(true);
        }

        reset();
        await load();
      }
    } catch (e) {
      const data = e?.response?.data;
      const msg = data?.message || data?.error || e.message || "Save failed";
      const hint = data?.hint ? ` ${data.hint}` : "";
      setErr(msg + hint);
    }
  }

  async function remove(id) {
    if (!canDelete) {
      setErr("You don’t have permission to delete shifts.");
      return;
    }

    if (!window.confirm("Delete this shift?")) return;

    setErr("");
    try {
      const response = await deleteShift(id);
      await load();
      // Show success message if related records were deleted
      if (response?.data?.deletedRelated) {
        const { callouts, timeEntries } = response.data.deletedRelated;
        if (callouts > 0 || timeEntries > 0) {
          console.log(`Deleted shift and ${callouts} callout(s), ${timeEntries} time entry/entries`);
        }
      }
    } catch (e) {
      const errorMsg = e?.response?.data?.message || e?.response?.data?.error || e.message || "Failed to delete shift";
      setErr(errorMsg);
      console.error("Delete shift error:", e);
    }
  }

  const guardName = (id) =>
    guards.find((g) => String(g.id) === String(id))?.name || "—";

  return (
    <div className="container">
      <div style={s.head}>
        <div>
          <h1 style={s.h1}>Shifts</h1>
          <div style={s.hint}>Create shifts and assign guards to coverage.</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn"
            onClick={() => navigate("/schedule-generation")}
            style={{
              background: "#8b5cf6",
              color: "white",
            }}
          >
            🤖 Auto Generate Schedule
          </button>
          <button className="btn" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {err ? <div className="notice">{err}</div> : null}

      <div style={s.grid}>
        <Card
          title={editingId ? "Edit Shift" : "Add Shift"}
          right={
            editingId ? (
              <button className="btn" onClick={reset}>
                Cancel
              </button>
            ) : null
          }
        >
          <form onSubmit={submit} style={s.form}>
            <label className="label">
              Location
              <input
                className="input"
                name="location"
                value={form.location}
                onChange={onChange}
                disabled={!canWrite}
              />
            </label>

            <label className="label">
              Date
              <input
                className="input"
                type="date"
                name="shiftDate"
                value={form.shiftDate}
                onChange={onChange}
                disabled={!canWrite}
              />
            </label>

            <label className="label">
              Start Time
              <input
                className="input"
                name="startTime"
                value={form.startTime}
                onChange={onChange}
                disabled={!canWrite}
              />
            </label>

            <label className="label">
              End Time
              <input
                className="input"
                name="endTime"
                value={form.endTime}
                onChange={onChange}
                disabled={!canWrite}
              />
            </label>

            <label className="label">
              Assign Guard (optional)
              <select
                className="select"
                name="assignedGuardId"
                value={form.assignedGuardId}
                onChange={onChange}
                disabled={!canWrite}
              >
                <option value="">Unassigned</option>
                {guards.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.email})
                  </option>
                ))}
              </select>
            </label>

            <button
              className="btn btnPrimary"
              type="submit"
              disabled={!canSubmit || !canWrite}
            >
              {editingId ? "Update Shift" : "Create Shift"}
            </button>
          </form>

          {/* AI Recommendations */}
          {showRecommendations && lastCreatedShift && (
            <ShiftOptimizationRecommendations
              shiftId={lastCreatedShift.id}
              recommendations={recommendations}
              onAssign={handleGuardAssigned}
              onClose={() => {
                setShowRecommendations(false);
                setRecommendations([]);
              }}
            />
          )}

          {/* Load Recommendations Button (for existing unassigned shifts) */}
          {!editingId && !showRecommendations && (
            <div style={{ marginTop: 12, fontSize: 13, opacity: 0.7 }}>
              💡 Tip: Create a shift without assigning a guard to see AI recommendations
            </div>
          )}
        </Card>

        <Card title="All Shifts" subtitle={loading ? "Loading…" : `${shifts.length} total`}>
          {loading ? (
            <div>Loading…</div>
          ) : shifts.length === 0 ? (
            <div>No shifts yet.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Guard</th>
                  <th>Location</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((sh) => (
                  <tr key={sh.id}>
                    <td>{sh.assignedGuardId ? guardName(sh.assignedGuardId) : "Unassigned"}</td>
                    <td>{sh.location || "—"}</td>
                    <td>{sh.startTime || "—"}</td>
                    <td>{sh.endTime || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="btn" onClick={() => startEdit(sh)} disabled={!canWrite}>
                          Edit
                        </button>
                        {!sh.assignedGuardId && canWrite && (
                          <button
                            className="btn"
                            onClick={() => loadRecommendations(sh.id)}
                            disabled={recommendationsLoading}
                            style={{
                              background: "rgba(59, 130, 246, 0.2)",
                              color: "#3b82f6",
                            }}
                          >
                            🤖 AI Suggest
                          </button>
                        )}
                        <button
                          className="btn btnDanger"
                          onClick={() => remove(sh.id)}
                          disabled={!canDelete}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}

const s = {
  head: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  h1: { margin: 0, fontSize: 26 },
  hint: { marginTop: 4, opacity: 0.7, fontSize: 13 },
  grid: { display: "grid", gridTemplateColumns: "440px 1fr", gap: 14 },
  form: { display: "grid", gap: 12 },
};
