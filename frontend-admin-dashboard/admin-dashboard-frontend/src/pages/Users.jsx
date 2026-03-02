import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listUsers,
  createUser,
  setUserRole,
  setUserPermissions,
  deleteUser,
} from "../services/api";
import { hasAccess } from "../utils/access";
import Card from "../components/Card";

const PERMS = [
  { key: "dashboard:read", label: "Dashboard (read)" },

  { key: "guards:read", label: "Guards (read)" },
  { key: "guards:write", label: "Guards (write)" },
  { key: "guards:delete", label: "Guards (delete)" },

  { key: "shifts:read", label: "Shifts (read)" },
  { key: "shifts:write", label: "Shifts (write)" },
  { key: "shifts:delete", label: "Shifts (delete)" },

  { key: "users:read", label: "Users (read)" },
  { key: "users:write", label: "Users (write)" },
];

function readMe() {
  try {
    const raw = localStorage.getItem("adminInfo");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Users() {
  const me = readMe();

  const canRead = hasAccess("users:read");
  const canWrite = hasAccess("users:write");
  const canDelete = hasAccess("users:delete"); // only matters if you implement delete endpoint

  // ✅ Get available permissions for current user (hierarchical system)
  // - Super Admin: All permissions
  // - Admin: Only permissions they have
  // - Supervisor: No permissions to grant
  const getAvailablePermissions = () => {
    if (me?.role === "super_admin") {
      // Super Admin can grant all permissions
      return PERMS;
    } else if (me?.role === "admin") {
      // Admin can only grant permissions they have
      const myPerms = Array.isArray(me?.permissions) ? me.permissions : [];
      return PERMS.filter(p => myPerms.includes(p.key));
    } else {
      // Supervisors cannot grant permissions
      return [];
    }
  };

  const availablePermissions = getAvailablePermissions();

  // Debug: log permissions
  React.useEffect(() => {
    console.log("🔍 Users page - Permissions check:", {
      canRead,
      canWrite,
      canDelete,
      me: me?.role,
      permissions: me?.permissions,
    });
  }, [canRead, canWrite, canDelete, me]);

  const queryClient = useQueryClient();

  // ============================
  // FETCH USERS
  // ============================
  const qUsers = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const response = await listUsers();
      // Axios wraps response, so response.data is the actual API response
      // API returns { data: [...] }, so response.data.data is the array
      return response.data;
    },
    enabled: canRead,
  });

  // Handle both response formats: { data: [...] } or direct array
  const users = Array.isArray(qUsers.data?.data)
    ? qUsers.data.data
    : Array.isArray(qUsers.data)
    ? qUsers.data
    : [];

  // ============================
  // SELECTED USER FOR PERMS EDIT
  // ============================
  const [selectedId, setSelectedId] = useState(null);

  const selected = useMemo(
    () => users.find((u) => String(u.id) === String(selectedId)) || null,
    [users, selectedId]
  );

  const [draftRole, setDraftRole] = useState("supervisor");
  const [draftPerms, setDraftPerms] = useState([]);

  // keep draft synced when selection changes
  React.useEffect(() => {
    if (!selected) return;
    setDraftRole(selected.role || "supervisor");
    setDraftPerms(Array.isArray(selected.permissions) ? selected.permissions : []);
  }, [selected]);

  // ============================
  // CREATE USER
  // ============================
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "supervisor",
    permissions: ["users:read"],
  });

  const createMutation = useMutation({
    mutationFn: (payload) =>
      createUser(
        payload.name,
        payload.email,
        payload.password,
        payload.role,
        payload.permissions
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  // ============================
  // UPDATE ROLE
  // ============================
  const roleMutation = useMutation({
    mutationFn: ({ id, role }) => setUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  // ============================
  // UPDATE PERMISSIONS
  // ============================
  const permsMutation = useMutation({
    mutationFn: ({ id, permissions }) => setUserPermissions(id, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  // ============================
  // DELETE USER
  // ============================
  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: async (response) => {
      const data = response?.data || response;
      console.log("✅ Delete successful:", data);
      
      // Clear selection after delete
      setSelectedId(null);
      
      // Remove the deleted user from cache immediately (optimistic update)
      queryClient.setQueryData(["users"], (oldData) => {
        if (!oldData?.data) return oldData;
        const deletedId = data?.deletedId || data?.id;
        return {
          ...oldData,
          data: oldData.data.filter((u) => String(u.id) !== String(deletedId)),
        };
      });
      
      // Then refetch to ensure consistency
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.refetchQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      console.error("❌ Delete error:", error);
      const errorMessage = error?.response?.data?.message || error?.message || "Failed to delete user";
      alert(errorMessage);
    },
  });

  if (!canRead) {
    return (
      <div className="container">
        <h1>Users</h1>
        <div className="notice">You don’t have permission to view users.</div>
      </div>
    );
  }

  // ============================
  // HANDLERS
  // ============================
  function handleCreate(e) {
    e.preventDefault();
    if (!newUser.email.trim() || !newUser.password.trim()) return;

    createMutation.mutate(newUser);
    setNewUser({
      name: "",
      email: "",
      password: "",
      role: "supervisor",
      permissions: ["users:read"],
    });
  }

  function toggleCreatePerm(key) {
    setNewUser((u) => {
      const set = new Set(u.permissions || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...u, permissions: Array.from(set) };
    });
  }

  function toggleDraftPerm(key) {
    setDraftPerms((prev) => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return Array.from(set);
    });
  }

  function saveSelected() {
    if (!selected) return;

    // safety: don’t lock yourself out accidentally
    const editingSelf = String(selected.id) === String(me?.id);
    if (editingSelf && !draftPerms.includes("users:write") && me?.role !== "admin" && me?.role !== "super_admin") {
      alert("You cannot remove your own users:write permission.");
      return;
    }

    if (draftRole !== (selected.role || "supervisor")) {
      roleMutation.mutate({ id: selected.id, role: draftRole });
    }
    permsMutation.mutate({ id: selected.id, permissions: draftPerms });
  }

  function handleDelete(id) {
    const user = users.find((u) => String(u.id) === String(id));
    const userName = user?.name || user?.email || "this user";
    
    if (!window.confirm(`Are you sure you want to delete ${userName}? This action cannot be undone.`)) {
      return;
    }

    // Prevent deleting yourself
    if (String(id) === String(me?.id)) {
      alert("You cannot delete your own account.");
      return;
    }

    console.log("🗑️ Attempting to delete user:", { id, userName, idType: typeof id });
    deleteMutation.mutate(id);
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: 14 }}>Users</h1>

      {/* CREATE USER */}
      {canWrite && (
        <Card title="Add User" subtitle="Create a new user account">
          <form
            onSubmit={handleCreate}
            style={{ display: "grid", gap: 10 }}
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                placeholder="Name (optional)"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
              <input
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
              <input
                placeholder="Temp Password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="user">user</option>
                <option value="supervisor">supervisor</option>
                <option value="admin">admin</option>
              </select>

              <button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create"}
              </button>
            </div>

              <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 800 }}>
                Permissions (optional)
                {me?.role === "admin" && (
                  <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginLeft: 8 }}>
                    (You can only grant permissions you have)
                  </span>
                )}
              </div>
              {availablePermissions.length === 0 && me?.role !== "super_admin" ? (
                <div style={{ padding: 16, background: "rgba(245, 158, 11, 0.1)", borderRadius: 8, color: "#f59e0b" }}>
                  ⚠️ You don't have any permissions to grant. Only Super Admin can grant permissions to you.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 8,
                  }}
                >
                  {availablePermissions.map((p) => {
                    const checked = (newUser.permissions || []).includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className="badge"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          justifyContent: "space-between",
                          padding: 10,
                          borderRadius: 12,
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCreatePerm(p.key)}
                          />
                          <span>{p.label}</span>
                        </span>
                        <span style={{ opacity: 0.7, fontSize: 12 }}>{p.key}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {createMutation.isError ? (
              <div className="notice">
                {createMutation.error?.response?.data?.message ||
                  createMutation.error?.message ||
                  "Create failed"}
              </div>
            ) : null}
          </form>
        </Card>
      )}

      {/* USERS TABLE */}
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 14 }}>
        <Card title="All Users" subtitle={`${users.length} total`}>
          {qUsers.isLoading ? (
            <div style={{ opacity: 0.7 }}>Loading…</div>
          ) : users.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No users found.</div>
          ) : (
            <div style={{ overflowX: "auto", width: "100%" }}>
              <table className="table" style={{ width: "100%", minWidth: 800 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Name</th>
                    <th style={{ minWidth: 220 }}>Email</th>
                    <th style={{ minWidth: 120 }}>Role</th>
                    <th style={{ minWidth: 90 }}>Perms</th>
                    <th style={{ minWidth: 180, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const permsCount = Array.isArray(u.permissions) ? u.permissions.length : 0;
                    return (
                      <tr key={u.id} style={String(u.id) === String(selectedId) ? { background: "rgba(255,255,255,0.03)" } : undefined}>
                        <td>{u.name || "—"}</td>
                        <td>{u.email}</td>
                        <td>
                          {canWrite ? (
                            <select
                              value={u.role || "user"}
                              onChange={(e) => roleMutation.mutate({ id: u.id, role: e.target.value })}
                            >
                              <option value="user">user</option>
                              <option value="supervisor">supervisor</option>
                              <option value="admin">admin</option>
                            </select>
                          ) : (
                            <span className="badge">{u.role}</span>
                          )}
                        </td>
                        <td>{permsCount}</td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "right", position: "relative", zIndex: 1 }}>
                          <button className="btn" onClick={() => setSelectedId(u.id)}>
                            Manage
                          </button>
                          {/* Show delete button if user has write permission OR is admin */}
                          {(canWrite || me?.role === "admin" || me?.role === "super_admin") && (
                            <button
                              className="btn"
                              onClick={() => handleDelete(u.id)}
                              disabled={deleteMutation.isPending}
                              style={{
                                marginLeft: 8,
                                background: "rgba(239,68,68,0.1)",
                                border: "1px solid rgba(239,68,68,0.3)",
                                color: "#ef4444",
                              }}
                            >
                              {deleteMutation.isPending ? "Deleting..." : "Delete"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Permissions" subtitle={selected ? `Editing: ${selected.email}` : "Select a user"}>
          {!selected ? (
            <div style={{ opacity: 0.7 }}>Select a user from the table.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800 }}>Role</div>
                <select
                  value={draftRole}
                  onChange={(e) => {
                    const newRole = e.target.value;
                    // Prevent Admins from changing roles to Admin
                    if (newRole === "admin" && me?.role !== "super_admin") {
                      alert("Only Super Admin can change users to Admin role");
                      return;
                    }
                    setDraftRole(newRole);
                  }}
                  disabled={!canWrite || (selected?.role === "admin" && me?.role !== "super_admin")}
                >
                  <option value="user">user</option>
                  <option value="supervisor">supervisor</option>
                  {me?.role === "super_admin" && <option value="admin">admin</option>}
                </select>
              </div>

              <div style={{ marginTop: 12, fontWeight: 800 }}>
                Permission overrides
                {me?.role === "admin" && selected?.role === "supervisor" && (
                  <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginLeft: 8 }}>
                    (You can only grant permissions you have)
                  </span>
                )}
                {me?.role === "admin" && selected?.role === "admin" && (
                  <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginLeft: 8, color: "#ef4444" }}>
                    (Only Super Admin can grant permissions to Admins)
                  </span>
                )}
              </div>

              {me?.role === "admin" && selected?.role === "admin" ? (
                <div style={{ padding: 16, background: "rgba(239, 68, 68, 0.1)", borderRadius: 8, color: "#ef4444", marginTop: 8 }}>
                  ⚠️ You cannot grant permissions to Admin users. Only Super Admin can manage Admin permissions.
                </div>
              ) : availablePermissions.length === 0 && me?.role !== "super_admin" ? (
                <div style={{ padding: 16, background: "rgba(245, 158, 11, 0.1)", borderRadius: 8, color: "#f59e0b", marginTop: 8 }}>
                  ⚠️ You don't have any permissions to grant.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {availablePermissions.map((p) => {
                    const checked = draftPerms.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className="badge"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "center",
                          padding: 10,
                          borderRadius: 12,
                          opacity: canWrite ? 1 : 0.6,
                          cursor: canWrite ? "pointer" : "not-allowed",
                        }}
                      >
                        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDraftPerm(p.key)}
                            disabled={!canWrite}
                          />
                          <span>{p.label}</span>
                        </span>
                        <span style={{ opacity: 0.7, fontSize: 12 }}>{p.key}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <button
                className="btn"
                onClick={saveSelected}
                disabled={!canWrite || roleMutation.isPending || permsMutation.isPending}
                style={{
                  marginTop: 12,
                  border: "1px solid rgba(34,197,94,.35)",
                  background: "rgba(34,197,94,.14)",
                }}
              >
                {roleMutation.isPending || permsMutation.isPending ? "Saving…" : "Save"}
              </button>

              {(roleMutation.isError || permsMutation.isError) && (
                <div className="notice" style={{ marginTop: 10 }}>
                  {roleMutation.error?.response?.data?.message ||
                    permsMutation.error?.response?.data?.message ||
                    roleMutation.error?.message ||
                    permsMutation.error?.message ||
                    "Save failed"}
                </div>
              )}

              {!canWrite && (
                <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
                  You can view users but can’t edit them (missing <b>users:write</b>).
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
