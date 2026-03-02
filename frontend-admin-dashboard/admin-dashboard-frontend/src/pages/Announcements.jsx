import React, { useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "../services/api";
import { hasAccess } from "../utils/access";

export default function Announcements() {
  // Permissions
  const canWrite = hasAccess("announcements:write") ?? true; // Default to true if not set
  const canDelete = hasAccess("announcements:delete") ?? true;

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    message: "",
    category: "COMPANY_WIDE",
    priority: "MEDIUM",
    tenant_id: "",
    site_id: "",
    expires_at: "",
    is_active: true,
  });

  const categories = [
    { value: "COMPANY_WIDE", label: "Company Wide" },
    { value: "SITE_SPECIFIC", label: "Site Specific" },
    { value: "POLICY_UPDATE", label: "Policy Update" },
    { value: "SHIFT_CHANGE", label: "Shift Change" },
    { value: "EMERGENCY_ALERT", label: "Emergency Alert" },
    { value: "TRAINING_NOTICE", label: "Training Notice" },
    { value: "SYSTEM_UPDATE", label: "System Update" },
  ];

  const priorities = [
    { value: "CRITICAL", label: "Critical", color: "#ef4444" },
    { value: "HIGH", label: "High", color: "#f59e0b" },
    { value: "MEDIUM", label: "Medium", color: "#3b82f6" },
    { value: "LOW", label: "Low", color: "#6b7280" },
  ];

  const canSubmit = useMemo(
    () => form.title.trim().length >= 3 && form.message.trim().length >= 10,
    [form]
  );

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setErr("");
    setSuccess("");

    try {
      const response = await listAnnouncements();
      const data = response.data?.data || response.data || [];
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch (e) {
      const errorMsg = e?.response?.data?.message || e?.response?.data?.error || e.message || "Failed to load announcements";
      setErr(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function startEdit(announcement) {
    if (!canWrite) {
      setErr("You don't have permission to edit announcements.");
      return;
    }

    setEditingId(announcement.id);
    setForm({
      title: announcement.title || "",
      message: announcement.message || "",
      category: announcement.category || "COMPANY_WIDE",
      priority: announcement.priority || "MEDIUM",
      tenant_id: announcement.tenantId || announcement.tenant_id || "",
      site_id: announcement.siteId || announcement.site_id || "",
      expires_at: announcement.expiresAt
        ? new Date(announcement.expiresAt).toISOString().slice(0, 16)
        : "",
      is_active: announcement.isActive !== undefined ? announcement.isActive : true,
    });
  }

  function reset() {
    setEditingId(null);
    setForm({
      title: "",
      message: "",
      category: "COMPANY_WIDE",
      priority: "MEDIUM",
      tenant_id: "",
      site_id: "",
      expires_at: "",
      is_active: true,
    });
    setErr("");
    setSuccess("");
  }

  async function submit(e) {
    e.preventDefault();

    if (!canWrite) {
      setErr("You don't have permission to create or edit announcements.");
      return;
    }

    if (!canSubmit) return;

    const payload = {
      title: form.title.trim(),
      message: form.message.trim(),
      category: form.category,
      priority: form.priority,
      tenant_id: form.tenant_id && form.tenant_id.trim() ? form.tenant_id.trim() : null,
      site_id: form.site_id && form.site_id.trim() ? form.site_id.trim() : null,
      expires_at: form.expires_at || null,
    };

    setErr("");
    setSuccess("");

    try {
      if (editingId) {
        // Update includes is_active
        await updateAnnouncement(editingId, {
          ...payload,
          is_active: form.is_active,
        });
        setSuccess("Announcement updated successfully!");
      } else {
        await createAnnouncement(payload);
        setSuccess("Announcement created successfully!");
      }
      reset();
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Save failed");
    }
  }

  async function remove(id) {
    if (!canDelete) {
      setErr("You don't have permission to delete announcements.");
      return;
    }

    if (!window.confirm("Delete this announcement? It will be deactivated.")) return;

    setErr("");
    setSuccess("");

    try {
      await deleteAnnouncement(id);
      setSuccess("Announcement deleted successfully!");
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Delete failed");
    }
  }

  function formatDate(dateValue) {
    if (!dateValue) return "—";
    try {
      return new Date(dateValue).toLocaleString();
    } catch {
      return "—";
    }
  }

  function getPriorityColor(priority) {
    const p = priorities.find((pr) => pr.value === priority);
    return p?.color || "#6b7280";
  }

  function getCategoryLabel(category) {
    const c = categories.find((cat) => cat.value === category);
    return c?.label || category;
  }

  const activeAnnouncements = announcements.filter((a) => a.isActive !== false);
  const expiredAnnouncements = announcements.filter((a) => {
    if (!a.expiresAt) return false;
    return new Date(a.expiresAt) < new Date();
  });

  return (
    <div className="container">
      <div style={s.head}>
        <div>
          <h1 style={s.h1}>Announcements & Notices</h1>
          <div style={s.hint}>
            Create and manage announcements for guards. Active announcements appear in the guard UI.
          </div>
        </div>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      {err ? <div className="notice" style={{ background: "#fee2e2", color: "#991b1b" }}>{err}</div> : null}
      {success ? <div className="notice" style={{ background: "#d1fae5", color: "#065f46" }}>{success}</div> : null}

      <div style={s.grid}>
        <Card
          title={editingId ? "Edit Announcement" : "Create Announcement"}
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
              Title *
              <input
                className="input"
                name="title"
                value={form.title}
                onChange={onChange}
                placeholder="e.g., New Policy Update"
                disabled={!canWrite}
                required
              />
            </label>

            <label className="label">
              Message *
              <textarea
                className="input"
                name="message"
                value={form.message}
                onChange={onChange}
                placeholder="Enter announcement message..."
                rows={5}
                disabled={!canWrite}
                required
                style={{ resize: "vertical", minHeight: 100 }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label className="label">
                Category
                <select
                  className="select"
                  name="category"
                  value={form.category}
                  onChange={onChange}
                  disabled={!canWrite}
                >
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="label">
                Priority
                <select
                  className="select"
                  name="priority"
                  value={form.priority}
                  onChange={onChange}
                  disabled={!canWrite}
                >
                  {priorities.map((pri) => (
                    <option key={pri.value} value={pri.value}>
                      {pri.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label className="label">
                Tenant ID (optional)
                <input
                  className="input"
                  name="tenant_id"
                  value={form.tenant_id}
                  onChange={onChange}
                  placeholder="Leave empty for company-wide"
                  disabled={!canWrite}
                />
              </label>

              <label className="label">
                Site ID (optional)
                <input
                  className="input"
                  name="site_id"
                  value={form.site_id}
                  onChange={onChange}
                  placeholder="Leave empty for all sites"
                  disabled={!canWrite}
                />
              </label>
            </div>

            <label className="label">
              Expires At (optional)
              <input
                className="input"
                type="datetime-local"
                name="expires_at"
                value={form.expires_at}
                onChange={onChange}
                disabled={!canWrite}
              />
            </label>

            {editingId && (
              <label className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  name="is_active"
                  checked={form.is_active}
                  onChange={onChange}
                  disabled={!canWrite}
                />
                <span>Active</span>
              </label>
            )}

            <button
              className="btn btnPrimary"
              type="submit"
              disabled={!canSubmit || !canWrite}
            >
              {editingId ? "Update Announcement" : "Create Announcement"}
            </button>
          </form>
        </Card>

        <Card
          title="All Announcements"
          subtitle={
            loading
              ? "Loading…"
              : err
              ? "Error loading"
              : `${announcements.length} total (${activeAnnouncements.length} active)`
          }
        >
          {loading ? (
            <div>Loading…</div>
          ) : err ? (
            <div style={{ color: "#ef4444", padding: 12 }}>
              <strong>Error:</strong> {err}
              <div style={{ marginTop: 8 }}>
                <button className="btn" onClick={load} style={{ fontSize: 12 }}>
                  Retry
                </button>
              </div>
            </div>
          ) : announcements.length === 0 ? (
            <div>No announcements yet. Create one to get started.</div>
          ) : (
            <div style={s.list}>
              {announcements.map((announcement) => {
                const isExpired = announcement.expiresAt && new Date(announcement.expiresAt) < new Date();
                const isActive = announcement.isActive !== false && !isExpired;

                return (
                  <div key={announcement.id} style={s.item}>
                    <div style={s.itemHeader}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <h3 style={s.itemTitle}>{announcement.title}</h3>
                          <span
                            style={{
                              ...s.badge,
                              background: getPriorityColor(announcement.priority) + "20",
                              color: getPriorityColor(announcement.priority),
                            }}
                          >
                            {announcement.priority}
                          </span>
                          <span style={s.badge}>
                            {getCategoryLabel(announcement.category)}
                          </span>
                          {isActive ? (
                            <span style={{ ...s.badge, background: "#d1fae5", color: "#065f46" }}>
                              Active
                            </span>
                          ) : (
                            <span style={{ ...s.badge, background: "#fee2e2", color: "#991b1b" }}>
                              {isExpired ? "Expired" : "Inactive"}
                            </span>
                          )}
                        </div>
                        <div style={s.itemMeta}>
                          Created: {formatDate(announcement.createdAt)}
                          {announcement.expiresAt && (
                            <> • Expires: {formatDate(announcement.expiresAt)}</>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={s.itemMessage}>{announcement.message}</div>
                    <div style={s.itemActions}>
                      <button
                        className="btn"
                        onClick={() => startEdit(announcement)}
                        disabled={!canWrite}
                        style={{ fontSize: 12, padding: "6px 12px" }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btnDanger"
                        onClick={() => remove(announcement.id)}
                        disabled={!canDelete}
                        style={{ fontSize: 12, padding: "6px 12px" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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
  hint: { marginTop: 4, opacity: 0.7, fontSize: 14 },
  grid: {
    display: "grid",
    gridTemplateColumns: "400px 1fr",
    gap: 14,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: "70vh",
    overflowY: "auto",
  },
  item: {
    padding: 16,
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.2)",
    background: "rgba(15,23,42,0.5)",
  },
  itemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  itemTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: "rgba(255,255,255,0.95)",
  },
  itemMeta: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 4,
  },
  itemMessage: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 1.6,
    marginBottom: 12,
    whiteSpace: "pre-wrap",
  },
  itemActions: {
    display: "flex",
    gap: 8,
    marginTop: 8,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    background: "rgba(148,163,184,0.2)",
    color: "rgba(255,255,255,0.8)",
  },
};
