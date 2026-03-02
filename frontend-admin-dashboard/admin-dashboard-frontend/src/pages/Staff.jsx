import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOwnerDashboardSummary,
  getOwnerStaffList,
  createOwnerStaff,
  updateOwnerStaff,
  deleteOwnerStaff,
} from "../services/api";
import { hasAccess } from "../utils/access";
import Card from "../components/Card";

export default function Staff() {
  const queryClient = useQueryClient();
  const canWrite = hasAccess("dashboard:write");
  const [form, setForm] = useState({ name: "", title: "", contact: "" });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", title: "", contact: "" });

  // Prefer dedicated staff list API; fallback to summary.staffList (same data, avoids 404 if route missing)
  const { data, isLoading, error } = useQuery({
    queryKey: ["owner-staff"],
    queryFn: async () => {
      try {
        const res = await getOwnerStaffList();
        return res.data?.data ?? res.data ?? [];
      } catch (err) {
        if (err?.response?.status === 404) {
          const summaryRes = await getOwnerDashboardSummary();
          return Array.isArray(summaryRes.data?.staffList) ? summaryRes.data.staffList : [];
        }
        throw err;
      }
    },
  });

  const staffList = Array.isArray(data) ? data : [];

  const createMutation = useMutation({
    mutationFn: (body) => createOwnerStaff(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-staff"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard-summary"] });
      setForm({ name: "", title: "", contact: "" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateOwnerStaff(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-staff"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard-summary"] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteOwnerStaff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-staff"] });
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard-summary"] });
    },
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.name?.trim()) return;
    createMutation.mutate({
      name: form.name.trim(),
      title: form.title?.trim() || undefined,
      contact: form.contact?.trim() || undefined,
    });
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditForm({
      name: row.name ?? "",
      title: row.title ?? "",
      contact: row.contact ?? "",
    });
  };

  const handleUpdate = (e) => {
    e.preventDefault();
    if (!editingId || !editForm.name?.trim()) return;
    updateMutation.mutate({
      id: editingId,
      body: {
        name: editForm.name.trim(),
        title: editForm.title?.trim() || undefined,
        contact: editForm.contact?.trim() || undefined,
      },
    });
  };

  const handleDelete = (id, name) => {
    if (!window.confirm(`Remove "${name}" from the staff list?`)) return;
    deleteMutation.mutate(id);
  };

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ marginTop: 0, marginBottom: 8 }}>Staff directory</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24, fontSize: 14 }}>
        Add name, title, and contact for staff. Owners can view this list on the Owner page.
      </p>

      {error && (
        <p style={{ padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 8, marginBottom: 16 }}>
          {error?.response?.data?.message || error?.message || "Failed to load staff"}
        </p>
      )}

      {canWrite && (
        <Card title="Add staff" style={{ marginBottom: 24 }}>
          <form onSubmit={handleCreate} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Operations Manager"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8 }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600 }}>Contact</label>
              <input
                type="text"
                value={form.contact}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                placeholder="Phone, email, etc."
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8 }}
              />
            </div>
            <button type="submit" className="btn btnPrimary" disabled={createMutation.isPending || !form.name?.trim()}>
              {createMutation.isPending ? "Adding…" : "Add"}
            </button>
          </form>
        </Card>
      )}

      <Card title="Staff list" subtitle={`${staffList.length} entry(ies). Visible to owners on the Owner page.`}>
        {isLoading ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : staffList.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No staff entries yet. Use the form above to add staff.</p>
        ) : (
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Contact</th>
                {canWrite && <th style={{ width: 120 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {staffList.map((row) => (
                <React.Fragment key={row.id}>
                  {editingId === row.id ? (
                    <tr>
                      <td colSpan={canWrite ? 4 : 3}>
                        <form
                          onSubmit={handleUpdate}
                          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "center" }}
                        >
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                            placeholder="Name"
                            style={{ padding: "6px 10px", borderRadius: 6 }}
                          />
                          <input
                            type="text"
                            value={editForm.title}
                            onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                            placeholder="Title"
                            style={{ padding: "6px 10px", borderRadius: 6 }}
                          />
                          <input
                            type="text"
                            value={editForm.contact}
                            onChange={(e) => setEditForm((f) => ({ ...f, contact: e.target.value }))}
                            placeholder="Contact"
                            style={{ padding: "6px 10px", borderRadius: 6 }}
                          />
                          <span style={{ display: "flex", gap: 8 }}>
                            <button type="submit" className="btn btnPrimary" disabled={updateMutation.isPending}>
                              Save
                            </button>
                            <button type="button" className="btn" onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                          </span>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td>{row.name}</td>
                      <td>{row.title ?? "—"}</td>
                      <td>{row.contact ?? "—"}</td>
                      {canWrite && (
                        <td>
                          <button type="button" className="btn" onClick={() => startEdit(row)} style={{ marginRight: 8 }}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => handleDelete(row.id, row.name)}
                            disabled={deleteMutation.isPending}
                            style={{ color: "#b91c1c" }}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
