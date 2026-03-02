// src/pages/Guards.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Card from "../components/Card";
import Modal from "../components/Modal";
import {
  listGuards,
  createGuard,
  updateGuard,
  deleteGuard,
  unlockGuard,
  updateGuardAvailability,
  getGuardAvailabilityLogs,
  getGuardHistory,
  getGuardScheduleEmailPreference,
  updateGuardScheduleEmailPreference,
  sendScheduleEmailNow,
} from "../services/api";
import { hasAccess, getAdminInfo } from "../utils/access";

/** Helpers */
function formatRelativeTime(dateValue) {
  if (!dateValue) return "—";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "—";

  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  return d.toLocaleDateString();
}

function AvailabilityBadge({ value }) {
  const on = !!value;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        border: "1px solid rgba(0,0,0,0.08)",
        background: on ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        color: on ? "#15803d" : "#b91c1c",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: on ? "#22c55e" : "#ef4444",
        }}
      />
      {on ? "Available" : "Unavailable"}
    </span>
  );
}

function ActiveBadge({ value }) {
  const on = !!value;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        border: "1px solid rgba(0,0,0,0.08)",
        background: on ? "rgba(59,130,246,0.10)" : "rgba(100,116,139,0.10)",
        color: on ? "#1d4ed8" : "#475569",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: on ? "#3b82f6" : "#94a3b8",
        }}
      />
      {on ? "Active" : "Inactive"}
    </span>
  );
}

function LockedBadge({ lockedUntil }) {
  const locked = lockedUntil && new Date(lockedUntil) > new Date();
  if (!locked) return <span style={{ fontSize: 12, color: "var(--muted)" }}>OK</span>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: "rgba(239,68,68,0.12)",
        color: "#b91c1c",
        whiteSpace: "nowrap",
      }}
    >
      🔒 Locked
    </span>
  );
}

const s = {
  head: { display: "flex", justifyContent: "space-between", marginBottom: 14 },
  h1: { margin: 0, fontSize: 26 },
  hint: { opacity: 0.7, fontSize: 13 },
  grid: { display: "grid", gridTemplateColumns: "420px 1fr", gap: 14 },
  form: { display: "grid", gap: 10 },
};

export default function Guards() {
  // Get current user info
  const me = getAdminInfo();
  const qc = useQueryClient();
  
  // Permissions
  const canWrite = hasAccess("guards:write");
  const canDelete = hasAccess("guards:delete");
  
  // Admins always have access
  const canEdit = canWrite || me?.role === "admin" || me?.role === "super_admin";
  const canRemove = canDelete || me?.role === "admin" || me?.role === "super_admin";

  const [guards, setGuards] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [updateTrigger, setUpdateTrigger] = useState(0); // Force re-render trigger
  const [updatingGuardId, setUpdatingGuardId] = useState(null); // Track which guard is being updated
  const [selectedGuards, setSelectedGuards] = useState(new Set()); // Multi-select state

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    availability: true,
    active: true,
  });

  // History modal state
  const [logOpen, setLogOpen] = useState(false);
  const [logGuard, setLogGuard] = useState(null);
  const [logRows, setLogRows] = useState([]);
  const [historyData, setHistoryData] = useState(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logErr, setLogErr] = useState("");

  // Email preferences modal state
  const [emailPrefsOpen, setEmailPrefsOpen] = useState(false);
  const [emailPrefsGuard, setEmailPrefsGuard] = useState(null);
  const [emailPrefs, setEmailPrefs] = useState({
    frequency: "weekly",
    day_of_week: 1,
    preferred_time: "09:00:00",
    is_active: true,
  });
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(false);
  const [emailPrefsErr, setEmailPrefsErr] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [unlockingGuardId, setUnlockingGuardId] = useState(null);

  // =====================
  // Data loading
  // =====================
  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await listGuards();
      setGuards(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to load guards");
    } finally {
      setLoading(false);
    }
  }

  // =====================
  // Comprehensive History
  // =====================
  async function openLogs(guard) {
    if (!guard?.id) return;

    setLogOpen(true);
    setLogGuard(guard);
    setLogRows([]);
    setHistoryData(null);
    setLogErr("");
    setLogLoading(true);

    try {
      const res = await getGuardHistory(guard.id);
      const data = res.data || {};
      setHistoryData(data);
      
      // Transform history into rows for display
      const historyItems = (data.history || []).map((item) => ({
        ...item,
        displayType: getHistoryDisplayType(item.type),
      }));
      
      setLogRows(historyItems);
    } catch (e) {
      setLogErr(e?.response?.data?.message || e?.message || "Failed to load history");
      // Fallback to old availability logs if new endpoint fails
      try {
        const res = await getGuardAvailabilityLogs(guard.id);
        const rows = Array.isArray(res.data) ? res.data : [];
        rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setLogRows(rows.map(r => ({ ...r, type: "availability", displayType: "Availability Changed" })));
      } catch (e2) {
        // Ignore fallback error
      }
    } finally {
      setLogLoading(false);
    }
  }

  function getHistoryDisplayType(type) {
    const types = {
      availability: "Availability Changed",
      callout: "Callout",
      late: "Running Late",
      ai_ranking: "AI Ranking",
      guard_created: "Guard Added",
    };
    return types[type] || type || "Unknown";
  }

  function closeLogs() {
    setLogOpen(false);
    setLogGuard(null);
    setLogRows([]);
    setHistoryData(null);
    setLogErr("");
  }

  // =====================
  // Availability toggle (PATCH + logging)
  // =====================
  async function toggleAvailability(guard) {
    console.log("🚀 toggleAvailability CALLED - guard:", guard, "canEdit:", canEdit);
    console.log("🚀 toggleAvailability - guard.availability:", guard.availability, "type:", typeof guard.availability);
    
    if (!canEdit) {
      const msg = "You don't have permission to change availability.";
      console.warn("⚠️", msg);
      setErr(msg);
      alert(msg);
      return;
    }

    if (!guard || !guard.id) {
      const msg = "Invalid guard data";
      console.error("❌", msg, guard);
      setErr(msg);
      return;
    }

    setErr("");
    setUpdatingGuardId(guard.id); // Mark this guard as updating
    
    try {
      // Handle undefined/null availability - default to false (unavailable)
      const currentAvailability = guard.availability !== undefined ? guard.availability : false;
      const next = !currentAvailability;
      
      console.log("🔄 toggleAvailability - guard:", guard.id, "current:", currentAvailability, "next:", next);
      console.log("🔄 toggleAvailability - Making API call to:", `/guards/${guard.id}`);

      console.log("🔄 toggleAvailability - About to call API with:", {
        guardId: guard.id,
        isAvailable: next,
        url: `/api/admin/guards/${guard.id}`
      });

      const response = await updateGuardAvailability(guard.id, {
        isAvailable: next,
        availabilityNote: `Set to ${next ? "available" : "unavailable"}`,
      });

      console.log("✅ toggleAvailability - response:", response);
      console.log("✅ toggleAvailability - response.status:", response.status);
      console.log("✅ toggleAvailability - response.data:", response.data);
      
      if (!response || !response.data) {
        throw new Error("Invalid response from server");
      }

      // Use the response data which includes the updated availability
      const updatedGuardData = response.data;
      const newAvailability = updatedGuardData.availability !== undefined 
        ? Boolean(updatedGuardData.availability)
        : Boolean(next);

      console.log("✅ toggleAvailability - New availability from response:", newAvailability);
      console.log("✅ toggleAvailability - Response data:", updatedGuardData);

      // Force immediate state update with new availability
      setGuards(prevGuards => {
        const updated = prevGuards.map(g => {
          if (g.id === guard.id) {
            const newGuard = { 
              ...g, 
              ...updatedGuardData, 
              availability: newAvailability 
            };
            console.log("🔄 Updating guard:", g.id, "from", g.availability, "to", newAvailability);
            console.log("🔄 New guard object:", newGuard);
            return newGuard;
          }
          return g;
        });
        
        // Verify the update
        const updatedGuard = updated.find(g => g.id === guard.id);
        console.log("✅ toggleAvailability - Updated guards state");
        console.log("✅ toggleAvailability - Updated guard availability:", updatedGuard?.availability);
        console.log("✅ toggleAvailability - All guards:", updated.map(g => ({ id: g.id, name: g.name, availability: g.availability })));
        
        return updated;
      });

      // Force a re-render by updating the trigger
      setUpdateTrigger(prev => prev + 1);
      setUpdatingGuardId(null); // Clear updating state
      
      // Force immediate refetch of dashboard availability query
      console.log("🔄 Invalidating and refetching availability query...");
      qc.invalidateQueries({ queryKey: ["availability"] });
      qc.refetchQueries({ queryKey: ["availability"] });
      
      // Reload from server after a longer delay to ensure the log is committed and queryable
      // But preserve the availability we just set, in case the log entry wasn't found
      setTimeout(async () => {
        try {
          console.log("🔄 toggleAvailability - Reloading guards list...");
          const res = await listGuards();
          const updatedGuards = Array.isArray(res.data) ? res.data : [];
          console.log("✅ toggleAvailability - Reloaded guards, count:", updatedGuards.length);
          const reloadedGuard = updatedGuards.find(g => g.id === guard.id);
          console.log("✅ toggleAvailability - Reloaded guard availability:", reloadedGuard?.availability, "expected:", newAvailability);
          
          // Only update if the reloaded value matches what we set, or if it's undefined/null
          // This prevents overwriting our state with stale data
          if (reloadedGuard) {
            const reloadedAvailability = Boolean(reloadedGuard.availability);
            if (reloadedAvailability === newAvailability) {
              // Values match - use reloaded data
              console.log(`✅ toggleAvailability - Reloaded availability matches, using server data`);
              setGuards(updatedGuards);
              setUpdateTrigger(prev => prev + 1);
            } else {
              // Values don't match - preserve our state (log might not be found yet)
              console.log(`⚠️ toggleAvailability - Mismatch! Preserving availability ${newAvailability} for guard ${guard.id} (reloaded had ${reloadedAvailability})`);
              const guardsWithPreservedAvailability = updatedGuards.map(g => {
                if (g.id === guard.id) {
                  return { ...g, availability: newAvailability };
                }
                return g;
              });
              setGuards(guardsWithPreservedAvailability);
              setUpdateTrigger(prev => prev + 1);
            }
          } else {
            // Guard not found in reload - keep current state
            console.warn("⚠️ toggleAvailability - Guard not found in reloaded list, keeping current state");
          }
        } catch (loadError) {
          console.error("❌ toggleAvailability - Error reloading:", loadError);
          // Don't fail - we already updated the state
        }
      }, 1500); // Increased delay to ensure log is committed

      // Auto-refresh logs if open for same guard
      if (logOpen && logGuard?.id === guard.id) {
        await openLogs(guard);
      }
    } catch (e) {
      console.error("❌ toggleAvailability - Error:", e);
      console.error("❌ toggleAvailability - Error message:", e?.message);
      console.error("❌ toggleAvailability - Error response:", e?.response);
      console.error("❌ toggleAvailability - Error response status:", e?.response?.status);
      console.error("❌ toggleAvailability - Error response data:", e?.response?.data);
      console.error("❌ toggleAvailability - Error request URL:", e?.config?.url);
      console.error("❌ toggleAvailability - Error request method:", e?.config?.method);
      const errorMsg = e?.response?.data?.message || e?.message || "Failed to update availability";
      setErr(errorMsg);
      setUpdatingGuardId(null); // Clear updating state on error
      alert(`Error: ${errorMsg}\n\nCheck browser console for details.`);
    }
  }

  // =====================
  // CRUD helpers
  // =====================
  const filtered = useMemo(() => {
    const sQ = q.trim().toLowerCase();
    if (!sQ) return guards;
    return guards.filter((g) =>
      [g.name, g.email, g.phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(sQ))
    );
  }, [guards, q]);

  // =====================
  // Multi-select helpers
  // =====================
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = new Set(filtered.map(g => g.id));
      setSelectedGuards(allIds);
    } else {
      setSelectedGuards(new Set());
    }
  };

  const handleSelectGuard = (guardId) => {
    setSelectedGuards(prev => {
      const next = new Set(prev);
      if (next.has(guardId)) {
        next.delete(guardId);
      } else {
        next.add(guardId);
      }
      return next;
    });
  };

  const isAllSelected = filtered.length > 0 && filtered.every(g => selectedGuards.has(g.id));
  const isIndeterminate = selectedGuards.size > 0 && selectedGuards.size < filtered.length;

  // Bulk availability update
  async function bulkUpdateAvailability(isAvailable) {
    if (selectedGuards.size === 0) {
      alert("Please select at least one guard");
      return;
    }

    if (!canEdit) {
      alert("You don't have permission to change availability.");
      return;
    }

    const confirmMsg = `Are you sure you want to set ${selectedGuards.size} guard(s) as ${isAvailable ? "available" : "unavailable"}?`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setErr("");
    const guardIds = Array.from(selectedGuards);
    const updates = guardIds.map(guardId => {
      const guard = guards.find(g => g.id === guardId);
      if (!guard) return null;
      return updateGuardAvailability(guardId, {
        isAvailable: isAvailable,
        availabilityNote: `Bulk update: Set to ${isAvailable ? "available" : "unavailable"}`,
      }).catch(err => {
        console.error(`❌ Failed to update guard ${guardId}:`, err);
        return { error: err, guardId };
      });
    });

    try {
      const results = await Promise.all(updates.filter(Boolean));
      const errors = results.filter(r => r && r.error);
      const successCount = results.length - errors.length;
      
      if (errors.length > 0) {
        alert(`⚠️ Updated ${successCount} guard(s), ${errors.length} failed. Check console for details.`);
        console.error("Bulk update errors:", errors);
      } else {
        alert(`✅ Successfully updated ${successCount} guard(s)`);
      }
      
      // Force immediate refetch of dashboard availability query
      console.log("🔄 Invalidating and refetching availability query after bulk update...");
      qc.invalidateQueries({ queryKey: ["availability"] });
      await qc.refetchQueries({ queryKey: ["availability"] });
      
      setSelectedGuards(new Set());
      // Reload guards list
      await load();
    } catch (e) {
      const errorMsg = e?.response?.data?.message || e?.message || "Failed to update guards";
      setErr(errorMsg);
      alert(`❌ Error: ${errorMsg}`);
    }
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
  }

  function startEdit(g) {
    setEditingId(g.id);
    setForm({
      name: g.name || "",
      email: g.email || "",
      phone: g.phone || "",
      availability: !!g.availability,
      active: !!g.active,
    });
  }

  function reset() {
    setEditingId(null);
    setForm({ name: "", email: "", phone: "", availability: true, active: true });
  }

  async function submit(e) {
    e.preventDefault();

    if (!canEdit) {
      setErr("You don't have permission to create or edit guards.");
      return;
    }

    setErr("");
    try {
      // ⚠️ UX Fix: If guard is being set to unavailable, ensure they stay active
      // Inactive guards don't appear on dashboard, so unavailable count won't update
      if (form.availability === false && form.active === false) {
        const confirmMsg = "Setting a guard to both unavailable AND inactive will remove them from the dashboard. Do you want to keep them active so they appear as unavailable?";
        if (window.confirm(confirmMsg)) {
          form.active = true; // Auto-fix: keep active when setting unavailable
          console.log("✅ Auto-fixed: Keeping guard active when setting to unavailable");
        }
      }
      
      const wasActive = editingId ? guards.find(g => g.id === editingId)?.active : undefined;
      const wasAvailability = editingId ? guards.find(g => g.id === editingId)?.availability : undefined;
      const activeChanged = editingId && form.active !== undefined && form.active !== wasActive;
      const availabilityChanged = editingId && form.availability !== undefined && form.availability !== wasAvailability;


      if (editingId) await updateGuard(editingId, form);
      else await createGuard(form);

      // If active status or availability changed, invalidate dashboard availability query
      if (activeChanged || availabilityChanged) {
        console.log("🔄 Guard status changed (active:", activeChanged, "availability:", availabilityChanged, "), invalidating dashboard query...");
        qc.invalidateQueries({ queryKey: ["availability"] });
        // Add a small delay to ensure the log is committed before refetching
        setTimeout(() => {
          qc.refetchQueries({ queryKey: ["availability"] });
        }, 500);
        qc.refetchQueries({ queryKey: ["availability"] });
      }

      reset();
      await load();
    } catch (e2) {
      setErr(e2?.response?.data?.message || e2?.message || "Save failed");
    }
  }

  async function remove(id) {
    if (!canRemove) {
      setErr("You don't have permission to delete guards.");
      return;
    }

    if (!window.confirm("Delete this guard?")) return;

    setErr("");
    try {
      await deleteGuard(id);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Delete failed");
    }
  }

  // =====================
  // Email Preferences
  // =====================
  async function openEmailPrefs(guard) {
    setEmailPrefsGuard(guard);
    setEmailPrefsOpen(true);
    setEmailPrefsErr("");
    setEmailPrefsLoading(true);
    
    try {
      const res = await getGuardScheduleEmailPreference(guard.id);
      const pref = res.data;
      setEmailPrefs({
        frequency: pref.frequency || "weekly",
        day_of_week: pref.day_of_week !== null && pref.day_of_week !== undefined ? pref.day_of_week : 1,
        preferred_time: pref.preferred_time || "09:00:00",
        is_active: pref.is_active !== undefined ? pref.is_active : true,
      });
    } catch (e) {
      // If no preference exists, use defaults
      setEmailPrefs({
        frequency: "weekly",
        day_of_week: 1,
        preferred_time: "09:00:00",
        is_active: true,
      });
    } finally {
      setEmailPrefsLoading(false);
    }
  }

  function closeEmailPrefs() {
    setEmailPrefsOpen(false);
    setEmailPrefsGuard(null);
    setEmailPrefsErr("");
  }

  function onEmailPrefsChange(e) {
    const { name, value, type, checked } = e.target;
    setEmailPrefs((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function saveEmailPrefs(e) {
    e.preventDefault();
    if (!emailPrefsGuard) return;

    setEmailPrefsErr("");
    setEmailPrefsLoading(true);
    
    try {
      await updateGuardScheduleEmailPreference(emailPrefsGuard.id, emailPrefs);
      alert("Email preferences saved successfully!");
      closeEmailPrefs();
    } catch (e) {
      setEmailPrefsErr(e?.response?.data?.message || e?.message || "Failed to save preferences");
    } finally {
      setEmailPrefsLoading(false);
    }
  }

  async function sendTestEmail() {
    if (!emailPrefsGuard) return;

    if (!window.confirm(`Send a test schedule email to ${emailPrefsGuard.name} (${emailPrefsGuard.email})?`)) {
      return;
    }

    setSendingEmail(true);
    setEmailPrefsErr("");
    
    try {
      await sendScheduleEmailNow(emailPrefsGuard.id);
      alert("Test email sent successfully!");
    } catch (e) {
      setEmailPrefsErr(e?.response?.data?.message || e?.message || "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  }

  // =====================
  // Render
  // =====================
  return (
    <div className="container">
      <div style={s.head}>
        <div>
          <h1 style={s.h1}>Guards</h1>
          <div style={s.hint}>Create, edit, and manage guard availability.</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <input
            className="input"
            style={{ width: 280 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search guards…"
          />
          <button className="btn" onClick={load}>
            Refresh
          </button>
        </div>
      </div>

      {err ? <div className="notice">{err}</div> : null}

      <div style={s.grid}>
        <Card title={editingId ? "Edit Guard" : "Add Guard"}>
          <form onSubmit={submit} style={s.form}>
            <input className="input" name="name" value={form.name} onChange={onChange} placeholder="Name" />
            <input className="input" name="email" value={form.email} onChange={onChange} placeholder="Email" />
            <input className="input" name="phone" value={form.phone} onChange={onChange} placeholder="Phone" />

            <label>
              <input type="checkbox" name="availability" checked={form.availability} onChange={onChange} /> Available
            </label>
            {!form.availability && (
              <div style={{ fontSize: 12, color: "#ef4444", marginTop: -8, marginBottom: 8 }}>
                ⚠️ Keep "Active" checked for unavailable guards to appear on dashboard
              </div>
            )}

            <label>
              <input type="checkbox" name="active" checked={form.active} onChange={onChange} /> Active
            </label>

            <button className="btn btnPrimary" type="submit" disabled={!canEdit}>
              {editingId ? "Update Guard" : "Create Guard"}
            </button>
          </form>
        </Card>

        <Card title="All Guards">
          {loading ? (
            <div>Loading…</div>
          ) : (
            <div style={{ overflowX: "auto", width: "100%" }}>
              {selectedGuards.size > 0 && (
                <div style={{ 
                  marginBottom: 12, 
                  padding: 12, 
                  background: "rgba(59, 130, 246, 0.1)", 
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap"
                }}>
                  <span style={{ fontWeight: 600, color: "#3b82f6" }}>
                    {selectedGuards.size} guard(s) selected
                  </span>
                  <button
                    type="button"
                    onClick={() => bulkUpdateAvailability(true)}
                    disabled={!canEdit}
                    style={{
                      padding: "6px 12px",
                      fontSize: 13,
                      background: "#22c55e",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: canEdit ? "pointer" : "not-allowed",
                      opacity: canEdit ? 1 : 0.5,
                    }}
                  >
                    Set Available ({selectedGuards.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkUpdateAvailability(false)}
                    disabled={!canEdit}
                    style={{
                      padding: "6px 12px",
                      fontSize: 13,
                      background: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      cursor: canEdit ? "pointer" : "not-allowed",
                      opacity: canEdit ? 1 : 0.5,
                    }}
                  >
                    Set Unavailable ({selectedGuards.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedGuards(new Set())}
                    style={{
                      padding: "6px 12px",
                      fontSize: 13,
                      background: "transparent",
                      color: "#666",
                      border: "1px solid #ccc",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Clear Selection
                  </button>
                </div>
              )}
              <table className="table" style={{ width: "100%", minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 50, width: 50 }}>
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = isIndeterminate;
                        }}
                        onChange={handleSelectAll}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th style={{ minWidth: 120 }}>Name</th>
                    <th style={{ minWidth: 200 }}>Email</th>
                    <th style={{ minWidth: 120 }}>Phone</th>
                    <th style={{ minWidth: 140 }}>Availability</th>
                    <th style={{ minWidth: 100 }}>Active</th>
                    <th style={{ minWidth: 120 }}>Account</th>
                    <th style={{ minWidth: 220, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((g) => {
                    const isAvailable = Boolean(g.availability);
                    const isSelected = selectedGuards.has(g.id);
                    return (
                      <tr 
                        key={`${g.id}-${isAvailable}-${updateTrigger}`}
                        style={{
                          background: isSelected ? "rgba(59, 130, 246, 0.05)" : "transparent",
                        }}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectGuard(g.id)}
                            style={{ cursor: "pointer" }}
                          />
                        </td>
                        <td>{g.name}</td>
                        <td>{g.email}</td>
                        <td>{g.phone || "—"}</td>

                        <td style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={isAvailable}
                              disabled={true}
                              readOnly
                              style={{ 
                                marginRight: 4, 
                                cursor: "default",
                                pointerEvents: "none",
                                width: 18,
                                height: 18,
                              }}
                            />
                            {isAvailable ? (
                              <button
                                type="button"
                                key={`unavailable-${g.id}-${isAvailable}-${updateTrigger}`}
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  if (!canEdit) {
                                    alert("You don't have permission to change availability.");
                                    return;
                                  }
                                  
                                  try {
                                    await toggleAvailability(g);
                                  } catch (error) {
                                    console.error("❌ Button onClick error:", error);
                                    const errorMsg = error.response?.data?.message || error.message || "Failed to toggle availability";
                                    alert(`❌ Error: ${errorMsg}`);
                                  }
                                }}
                                disabled={!canEdit || updatingGuardId === g.id}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 12,
                                  cursor: (canEdit && updatingGuardId !== g.id) ? "pointer" : "not-allowed",
                                  opacity: (canEdit && updatingGuardId !== g.id) ? 1 : 0.5,
                                  background: canEdit ? "#ef4444" : "#ccc",
                                  color: "white",
                                  border: "none",
                                  borderRadius: 4,
                                }}
                                title={canEdit ? "Set as unavailable" : "No permission"}
                              >
                                {updatingGuardId === g.id ? "Updating..." : "Set Unavailable"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                key={`available-${g.id}-${isAvailable}-${updateTrigger}`}
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  if (!canEdit) {
                                    alert("You don't have permission to change availability.");
                                    return;
                                  }
                                  
                                  try {
                                    await toggleAvailability(g);
                                  } catch (error) {
                                    console.error("❌ Button onClick error:", error);
                                    const errorMsg = error.response?.data?.message || error.message || "Failed to toggle availability";
                                    alert(`❌ Error: ${errorMsg}`);
                                  }
                                }}
                                disabled={!canEdit || updatingGuardId === g.id}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 12,
                                  cursor: (canEdit && updatingGuardId !== g.id) ? "pointer" : "not-allowed",
                                  opacity: (canEdit && updatingGuardId !== g.id) ? 1 : 0.5,
                                  background: canEdit ? "#22c55e" : "#ccc",
                                  color: "white",
                                  border: "none",
                                  borderRadius: 4,
                                }}
                                title={canEdit ? "Set as available" : "No permission"}
                              >
                                {updatingGuardId === g.id ? "Updating..." : "Set Available"}
                              </button>
                            )}
                          </div>
                          <AvailabilityBadge value={isAvailable} />
                        </td>

                        <td>
                          <ActiveBadge value={g.active} />
                        </td>

                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <LockedBadge lockedUntil={g.locked_until} />
                            {g.locked_until && new Date(g.locked_until) > new Date() && canEdit && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setUnlockingGuardId(g.id);
                                  try {
                                    await unlockGuard(g.id);
                                    await load();
                                  } catch (err) {
                                    alert(err?.response?.data?.message || "Failed to unlock");
                                  } finally {
                                    setUnlockingGuardId(null);
                                  }
                                }}
                                disabled={unlockingGuardId === g.id}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: 12,
                                  background: "rgba(34,197,94,0.15)",
                                  color: "#15803d",
                                  border: "1px solid rgba(34,197,94,0.3)",
                                  borderRadius: 4,
                                  cursor: unlockingGuardId === g.id ? "not-allowed" : "pointer",
                                }}
                              >
                                {unlockingGuardId === g.id ? "Unlocking…" : "Unlock"}
                              </button>
                            )}
                          </div>
                        </td>

                        <td style={{ whiteSpace: "nowrap", textAlign: "right", position: "relative", zIndex: 1 }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          <button 
                            className="btn" 
                            onClick={() => startEdit(g)} 
                            disabled={!canEdit}
                            style={{ 
                              opacity: canEdit ? 1 : 0.5,
                              cursor: canEdit ? "pointer" : "not-allowed",
                              whiteSpace: "nowrap"
                            }}
                          >
                            Edit
                          </button>
                          <button 
                            className="btn" 
                            onClick={() => openLogs(g)}
                            style={{ whiteSpace: "nowrap" }}
                          >
                            History
                          </button>
                          <button 
                            className="btn" 
                            onClick={() => openEmailPrefs(g)}
                            style={{ whiteSpace: "nowrap", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", color: "#3b82f6" }}
                            title="Email Schedule Preferences"
                          >
                            📧 Email
                          </button>
                          <button 
                            className="btn btnDanger" 
                            onClick={() => remove(g.id)} 
                            disabled={!canRemove}
                            style={{ 
                              opacity: canRemove ? 1 : 0.5,
                              cursor: canRemove ? "pointer" : "not-allowed",
                              background: canRemove ? "rgba(239,68,68,0.1)" : "rgba(100,100,100,0.1)",
                              border: canRemove ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(100,100,100,0.3)",
                              color: canRemove ? "#ef4444" : "#666",
                              whiteSpace: "nowrap"
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {emailPrefsOpen && emailPrefsGuard ? (
        <Modal title={`📧 Schedule Email Preferences — ${emailPrefsGuard.name}`} onClose={closeEmailPrefs}>
          {emailPrefsErr ? <div className="notice">{emailPrefsErr}</div> : null}

          {emailPrefsLoading ? (
            <div style={{ opacity: 0.8 }}>Loading preferences…</div>
          ) : (
            <form onSubmit={saveEmailPrefs} style={s.form}>
              <div style={{ marginBottom: 16, padding: 12, background: "rgba(59,130,246,0.1)", borderRadius: 8, fontSize: 13 }}>
                <strong>Guard:</strong> {emailPrefsGuard.name}<br />
                <strong>Email:</strong> {emailPrefsGuard.email || "No email address"}
              </div>

              <label className="label">
                Email Frequency
                <select
                  className="input"
                  name="frequency"
                  value={emailPrefs.frequency}
                  onChange={onEmailPrefsChange}
                >
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-Weekly (Every 2 weeks)</option>
                  <option value="monthly">Monthly</option>
                  <option value="never">Never (Disabled)</option>
                </select>
              </label>

              {emailPrefs.frequency !== "never" && (
                <>
                  <label className="label">
                    Day of Week (for weekly/bi-weekly)
                    <select
                      className="input"
                      name="day_of_week"
                      value={emailPrefs.day_of_week}
                      onChange={onEmailPrefsChange}
                    >
                      <option value={0}>Sunday</option>
                      <option value={1}>Monday</option>
                      <option value={2}>Tuesday</option>
                      <option value={3}>Wednesday</option>
                      <option value={4}>Thursday</option>
                      <option value={5}>Friday</option>
                      <option value={6}>Saturday</option>
                    </select>
                  </label>

                  <label className="label">
                    Preferred Time
                    <input
                      className="input"
                      type="time"
                      name="preferred_time"
                      value={emailPrefs.preferred_time}
                      onChange={onEmailPrefsChange}
                    />
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                      Time when schedule email will be sent
                    </div>
                  </label>
                </>
              )}

              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  name="is_active"
                  checked={emailPrefs.is_active}
                  onChange={onEmailPrefsChange}
                />
                <span>Enable schedule emails for this guard</span>
              </label>

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button
                  className="btn btnPrimary"
                  type="submit"
                  disabled={emailPrefsLoading || !emailPrefsGuard.email}
                >
                  {emailPrefsLoading ? "Saving..." : "Save Preferences"}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={sendTestEmail}
                  disabled={sendingEmail || !emailPrefsGuard.email}
                  style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}
                >
                  {sendingEmail ? "Sending..." : "📧 Send Test Email"}
                </button>
              </div>

              {!emailPrefsGuard.email && (
                <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.1)", borderRadius: 6, fontSize: 12, color: "#ef4444" }}>
                  ⚠️ This guard has no email address. Please add an email address to enable schedule emails.
                </div>
              )}

              <div style={{ marginTop: 16, padding: 12, background: "rgba(0,0,0,0.03)", borderRadius: 8, fontSize: 12, opacity: 0.8 }}>
                <strong>How it works:</strong><br />
                • The system will automatically send schedule emails based on the frequency you set<br />
                • Weekly emails are sent every 7 days on the selected day<br />
                • Bi-weekly emails are sent every 14 days on the selected day<br />
                • You can manually send a test email anytime using the button above
              </div>
            </form>
          )}
        </Modal>
      ) : null}

      {logOpen ? (
        <Modal title={`Guard History — ${logGuard?.name || ""}`} onClose={closeLogs}>
          {logErr ? <div className="notice">{logErr}</div> : null}

          {historyData?.guard && (
            <div style={{ marginBottom: 20, padding: 12, background: "rgba(0,0,0,0.03)", borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Guard Information</div>
              <div style={{ fontSize: 14, opacity: 0.8 }}>
                <div>Email: {historyData.guard.email}</div>
                <div>Added: {historyData.guard.createdAt ? new Date(historyData.guard.createdAt).toLocaleString() : "—"}</div>
              </div>
              {historyData.summary && (
                <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    Availability: {historyData.summary.totalAvailabilityChanges}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    Callouts: {historyData.summary.totalCallouts}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    Late: {historyData.summary.totalLate}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>
                    AI Rankings: {historyData.summary.totalAIRankings}
                  </span>
                </div>
              )}
            </div>
          )}

          {logLoading ? (
            <div style={{ opacity: 0.8 }}>Loading history…</div>
          ) : logRows.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No history yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {logRows.map((r, idx) => {
                const when = r.createdAt || r.timestamp ? new Date(r.createdAt || r.timestamp) : null;
                const type = r.type || "availability";
                const displayType = r.displayType || getHistoryDisplayType(type);
                
                // Color based on type
                const typeColors = {
                  availability: { dot: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
                  callout: { dot: "#ef4444", bg: "rgba(239,68,68,0.1)" },
                  late: { dot: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
                  ai_ranking: { dot: "#8b5cf6", bg: "rgba(139,92,246,0.1)" },
                  guard_created: { dot: "#22c55e", bg: "rgba(34,197,94,0.1)" },
                };
                const colors = typeColors[type] || typeColors.availability;

                const from = r.from !== undefined && r.from !== null ? (r.from ? "Available" : "Unavailable") : null;
                const to = r.to !== undefined && r.to !== null ? (r.to ? "Available" : "Unavailable") : null;

                return (
                  <div
                    key={r.id || `history-${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "14px 1fr",
                      gap: 12,
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid rgba(0,0,0,0.08)",
                      background: colors.bg,
                    }}
                  >
                    {/* timeline dot */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <div
                        style={{
                          marginTop: 4,
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: colors.dot,
                        }}
                      />
                    </div>

                    {/* content */}
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>
                          {displayType}
                        </div>
                        <div style={{ opacity: 0.75, fontSize: 12, whiteSpace: "nowrap" }}>
                          {formatRelativeTime(r.createdAt || r.timestamp)}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 13 }}>
                        {when && (
                          <span style={{ opacity: 0.8 }}>
                            {when.toLocaleString()}
                          </span>
                        )}

                        {/* Availability change */}
                        {type === "availability" && from && to && (
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 700,
                              background: "rgba(0,0,0,0.06)",
                            }}
                          >
                            {from} → {to}
                          </span>
                        )}

                        {/* Callout */}
                        {type === "callout" && (
                          <>
                            <span style={{ opacity: 0.8 }}>Reason: {r.reason || "Unknown"}</span>
                            {r.shiftId && (
                              <span style={{ opacity: 0.7, fontSize: 11 }}>
                                Shift: {String(r.shiftId).substring(0, 8)}...
                              </span>
                            )}
                          </>
                        )}

                        {/* Late */}
                        {type === "late" && (
                          <>
                            <span style={{ opacity: 0.8 }}>Reason: {r.reason || "Running late"}</span>
                            {r.shiftDate && (
                              <span style={{ opacity: 0.7, fontSize: 11 }}>
                                Shift: {r.shiftDate} {r.shiftStart ? `(${r.shiftStart})` : ""}
                              </span>
                            )}
                          </>
                        )}

                        {/* AI Ranking */}
                        {type === "ai_ranking" && (
                          <>
                            {r.ranking !== null && r.ranking !== undefined && (
                              <span style={{ opacity: 0.8 }}>
                                Rank: #{r.ranking}
                              </span>
                            )}
                            {r.confidence !== null && r.confidence !== undefined && (
                              <span style={{ opacity: 0.8 }}>
                                Confidence: {((r.confidence || 0) * 100).toFixed(0)}%
                              </span>
                            )}
                            {r.isOverridden && (
                              <span
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: "rgba(245,158,11,0.2)",
                                  color: "#f59e0b",
                                }}
                              >
                                Overridden
                              </span>
                            )}
                            {r.shiftDate && (
                              <span style={{ opacity: 0.7, fontSize: 11 }}>
                                {r.shiftDate} {r.shiftStart ? `(${r.shiftStart})` : ""}
                              </span>
                            )}
                          </>
                        )}

                        {/* Guard Created */}
                        {type === "guard_created" && (
                          <span style={{ opacity: 0.8, fontStyle: "italic" }}>
                            Guard account created
                          </span>
                        )}

                        {r.actorAdminId && (
                          <span style={{ fontSize: 12, opacity: 0.7 }}>
                            by Admin #{r.actorAdminId}
                          </span>
                        )}

                        {r.note && (
                          <span style={{ fontSize: 12, opacity: 0.7, fontStyle: "italic" }}>
                            {r.note}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
