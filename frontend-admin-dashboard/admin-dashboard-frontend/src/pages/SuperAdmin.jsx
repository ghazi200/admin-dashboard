import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  getTenantStats,
  createTenantAdmin,
  getSuperAdminAnalytics,
} from "../services/superAdmin";
import Card from "../components/Card";

export default function SuperAdmin() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [activeTab, setActiveTab] = useState("tenants"); // "tenants" | "analytics"
  const [formData, setFormData] = useState({
    name: "",
    domain: "",
    contact_email: "",
    contact_phone: "",
    subscription_plan: "free",
    status: "trial",
    features: {
      dashboard: true,
      analytics: false,
      ai_optimization: false,
      callout_prediction: false,
      report_builder: false,
      smart_notifications: false,
      scheduled_reports: false,
      multi_location: false,
      api_access: false,
      white_label: false,
    },
    max_guards: null,
    max_locations: null,
    location: "",
    monthly_amount: 0,
    notes: "",
  });

  // Fetch tenants
  const { data: tenants, isLoading: tenantsLoading, refetch: refetchTenants } = useQuery({
    queryKey: ["superAdminTenants"],
    queryFn: async () => {
      const response = await listTenants();
      return response.data;
    },
  });

  // Fetch analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["superAdminAnalytics"],
    queryFn: async () => {
      const response = await getSuperAdminAnalytics();
      return response.data;
    },
  });

  // Fetch tenant stats when selected
  const { data: tenantStats } = useQuery({
    queryKey: ["tenantStats", selectedTenant],
    queryFn: async () => {
      if (!selectedTenant) return null;
      const response = await getTenantStats(selectedTenant);
      return response.data;
    },
    enabled: !!selectedTenant,
  });

  const createMutation = useMutation({
    mutationFn: createTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superAdminTenants"] });
      setShowCreateModal(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateTenant(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superAdminTenants"] });
      setShowCreateModal(false);
      setEditingTenant(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superAdminTenants"] });
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: ({ tenantId, data }) => createTenantAdmin(tenantId, data),
    onSuccess: () => {
      alert("✅ Admin created successfully!");
      queryClient.invalidateQueries({ queryKey: ["tenantStats", selectedTenant] });
    },
  });

  function resetForm() {
    setFormData({
      name: "",
      domain: "",
      contact_email: "",
      contact_phone: "",
      subscription_plan: "free",
      status: "trial",
      features: {
        dashboard: true,
        analytics: false,
        ai_optimization: false,
        callout_prediction: false,
        report_builder: false,
        smart_notifications: false,
        scheduled_reports: false,
        multi_location: false,
        api_access: false,
        white_label: false,
      },
      max_guards: null,
      max_locations: null,
      location: "",
      monthly_amount: 0,
      notes: "",
    });
  }

  function handleEdit(tenant) {
    setEditingTenant(tenant);
    setFormData({
      name: tenant.name || "",
      domain: tenant.domain || "",
      contact_email: tenant.contact_email || "",
      contact_phone: tenant.contact_phone || "",
      subscription_plan: tenant.subscription_plan || "free",
      status: tenant.status || "trial",
      features: tenant.features || {
        dashboard: true,
        analytics: false,
        ai_optimization: false,
        callout_prediction: false,
        report_builder: false,
        smart_notifications: false,
        scheduled_reports: false,
        multi_location: false,
        api_access: false,
        white_label: false,
      },
      max_guards: tenant.max_guards || null,
      max_locations: tenant.max_locations || null,
      location: tenant.location || "",
      monthly_amount: tenant.monthly_amount || 0,
      notes: tenant.notes || "",
    });
    setShowCreateModal(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (editingTenant) {
      updateMutation.mutate({ id: editingTenant.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  function toggleFeature(featureKey) {
    setFormData({
      ...formData,
      features: {
        ...formData.features,
        [featureKey]: !formData.features[featureKey],
      },
    });
  }

  function getStatusColor(status) {
    switch (status) {
      case "active":
        return "rgba(34, 197, 94, 0.2)";
      case "trial":
        return "rgba(59, 130, 246, 0.2)";
      case "suspended":
        return "rgba(239, 68, 68, 0.2)";
      default:
        return "rgba(107, 114, 128, 0.2)";
    }
  }

  function getStatusBorderColor(status) {
    switch (status) {
      case "active":
        return "rgba(34, 197, 94, 0.5)";
      case "trial":
        return "rgba(59, 130, 246, 0.5)";
      case "suspended":
        return "rgba(239, 68, 68, 0.5)";
      default:
        return "rgba(107, 114, 128, 0.5)";
    }
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>🏢 Super-Admin Portal</h1>
        <div style={{ marginTop: 4, opacity: 0.7, fontSize: 13 }}>
          Manage companies, tenants, and platform features
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button
          className={`btn ${activeTab === "tenants" ? "btnPrimary" : ""}`}
          onClick={() => setActiveTab("tenants")}
        >
          🏢 Tenants
        </button>
        <button
          className={`btn ${activeTab === "analytics" ? "btnPrimary" : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          📊 Analytics
        </button>
      </div>

      {activeTab === "analytics" ? (
        <Card title="Platform Analytics">
          {analyticsLoading ? (
            <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 15 }}>
              <div style={{ padding: 20, background: "rgba(59, 130, 246, 0.1)", borderRadius: 8 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#3b82f6" }}>
                  {analytics?.total_tenants || 0}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Total Tenants</div>
              </div>
              <div style={{ padding: 20, background: "rgba(34, 197, 94, 0.1)", borderRadius: 8 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#22c55e" }}>
                  {analytics?.active_tenants || 0}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Active Tenants</div>
              </div>
              <div style={{ padding: 20, background: "rgba(59, 130, 246, 0.1)", borderRadius: 8 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#3b82f6" }}>
                  {analytics?.trial_tenants || 0}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Trial Tenants</div>
              </div>
              <div style={{ padding: 20, background: "rgba(168, 85, 247, 0.1)", borderRadius: 8 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#a855f7" }}>
                  {analytics?.enterprise_tenants || 0}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Enterprise</div>
              </div>
              <div style={{ padding: 20, background: "rgba(251, 146, 60, 0.1)", borderRadius: 8 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#fb923c" }}>
                  {analytics?.total_admins || 0}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Total Admins</div>
              </div>
              <div style={{ padding: 20, background: "rgba(251, 146, 60, 0.1)", borderRadius: 8 }}>
                <div style={{ fontSize: 32, fontWeight: 900, color: "#fb923c" }}>
                  {analytics?.total_guards || 0}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Total Guards</div>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card
            title="Tenants"
            right={
              <button
                className="btn btnPrimary"
                onClick={() => {
                  setEditingTenant(null);
                  resetForm();
                  setShowCreateModal(true);
                }}
              >
                + New Tenant
              </button>
            }
          >
            {tenantsLoading ? (
              <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
            ) : tenants?.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>
                No tenants found. Create your first tenant to get started.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                {tenants?.map((tenant) => (
                  <div
                    key={tenant.id}
                    style={{
                      padding: 20,
                      background: getStatusColor(tenant.status),
                      borderRadius: 8,
                      border: `2px solid ${getStatusBorderColor(tenant.status)}`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <h3 style={{ margin: 0, fontSize: 18 }}>{tenant.name}</h3>
                          <span
                            style={{
                              padding: "4px 12px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                              background:
                                tenant.status === "active"
                                  ? "rgba(34, 197, 94, 0.3)"
                                  : tenant.status === "trial"
                                  ? "rgba(59, 130, 246, 0.3)"
                                  : "rgba(107, 114, 128, 0.3)",
                              color: "#fff",
                            }}
                          >
                            {tenant.status?.toUpperCase()}
                          </span>
                          <span
                            style={{
                              padding: "4px 12px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                              background: "rgba(168, 85, 247, 0.3)",
                              color: "#fff",
                            }}
                          >
                            {tenant.subscription_plan?.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                          {tenant.contact_email && `📧 ${tenant.contact_email}`}
                          {tenant.contact_phone && ` | 📞 ${tenant.contact_phone}`}
                          {tenant.domain && ` | 🌐 ${tenant.domain}`}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                          👥 {tenant.admin_count || 0} Admins | 🛡️ {tenant.guard_count || 0} Guards | 📅 {tenant.shift_count || 0} Shifts
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          Enabled Features:{" "}
                          {Object.entries(tenant.features || {})
                            .filter(([_, enabled]) => enabled)
                            .map(([key]) => key.replace(/_/g, " "))
                            .join(", ") || "None"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          className="btn"
                          onClick={() => {
                            setSelectedTenant(tenant.id);
                          }}
                          style={{ fontSize: 11, padding: "4px 8px" }}
                        >
                          📊 Stats
                        </button>
                        <button
                          className="btn"
                          onClick={() => handleEdit(tenant)}
                          style={{ fontSize: 11, padding: "4px 8px" }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="btn"
                          onClick={() => {
                            if (window.confirm(`Delete tenant "${tenant.name}"? This will deactivate the tenant.`)) {
                              deleteMutation.mutate(tenant.id);
                            }
                          }}
                          style={{ fontSize: 11, padding: "4px 8px", background: "rgba(239, 68, 68, 0.2)", color: "#ef4444" }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Tenant Stats Modal */}
          {selectedTenant && tenantStats && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 20,
              }}
              onClick={() => setSelectedTenant(null)}
            >
              <Card
                title="Tenant Statistics"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: 500, width: "100%" }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 15 }}>
                  <div style={{ padding: 15, background: "rgba(59, 130, 246, 0.1)", borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#3b82f6" }}>
                      {tenantStats.admin_count || 0}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Admins</div>
                  </div>
                  <div style={{ padding: 15, background: "rgba(34, 197, 94, 0.1)", borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#22c55e" }}>
                      {tenantStats.guard_count || 0}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Guards</div>
                  </div>
                  <div style={{ padding: 15, background: "rgba(251, 146, 60, 0.1)", borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#fb923c" }}>
                      {tenantStats.shift_count || 0}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Total Shifts</div>
                  </div>
                  <div style={{ padding: 15, background: "rgba(239, 68, 68, 0.1)", borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#ef4444" }}>
                      {tenantStats.open_shifts || 0}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Open Shifts</div>
                  </div>
                  <div style={{ padding: 15, background: "rgba(168, 85, 247, 0.1)", borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#a855f7" }}>
                      {tenantStats.callout_count || 0}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Callouts</div>
                  </div>
                  <div style={{ padding: 15, background: "rgba(59, 130, 246, 0.1)", borderRadius: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#3b82f6" }}>
                      {tenantStats.shifts_last_30_days || 0}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>Shifts (30d)</div>
                  </div>
                </div>
                <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn" onClick={() => setSelectedTenant(null)}>
                    Close
                  </button>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Tenant Modal */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => {
            setShowCreateModal(false);
            setEditingTenant(null);
          }}
        >
          <Card
            title={editingTenant ? "Edit Tenant" : "Create New Tenant"}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 700, width: "100%", maxHeight: "90vh", overflow: "auto" }}
          >
            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                <div>
                  <label className="label">Company Name *</label>
                  <input
                    className="input"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                  <div>
                    <label className="label">Domain (optional)</label>
                    <input
                      className="input"
                      value={formData.domain}
                      onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                      placeholder="company.com"
                    />
                  </div>
                  <div>
                    <label className="label">Subscription Plan</label>
                    <select
                      className="input"
                      value={formData.subscription_plan}
                      onChange={(e) => setFormData({ ...formData, subscription_plan: e.target.value })}
                    >
                      <option value="free">Free</option>
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                  <div>
                    <label className="label">Contact Email</label>
                    <input
                      className="input"
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Contact Phone</label>
                    <input
                      className="input"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                  <div>
                    <label className="label">Location</label>
                    <input
                      className="input"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="City, State or Address"
                    />
                  </div>
                  <div>
                    <label className="label">Monthly Amount ($)</label>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      value={formData.monthly_amount}
                      onChange={(e) => setFormData({ ...formData, monthly_amount: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Status</label>
                  <select
                    className="input"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="trial">Trial</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div>
                  <label className="label">Features</label>
                  <div
                    style={{
                      padding: 15,
                      background: "rgba(59, 130, 246, 0.1)",
                      borderRadius: 8,
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 10,
                    }}
                  >
                    {Object.entries(formData.features).map(([key, enabled]) => (
                      <label
                        key={key}
                        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleFeature(key)}
                        />
                        <span style={{ fontSize: 13 }}>
                          {key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 15 }}>
                  <div>
                    <label className="label">Max Guards (null = unlimited)</label>
                    <input
                      className="input"
                      type="number"
                      value={formData.max_guards || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_guards: e.target.value ? parseInt(e.target.value) : null,
                        })
                      }
                      placeholder="Unlimited"
                    />
                  </div>
                  <div>
                    <label className="label">Max Locations (null = unlimited)</label>
                    <input
                      className="input"
                      type="number"
                      value={formData.max_locations || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_locations: e.target.value ? parseInt(e.target.value) : null,
                        })
                      }
                      placeholder="Unlimited"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Notes</label>
                  <textarea
                    className="input"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    placeholder="Internal notes about this tenant..."
                  />
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="submit"
                    className="btn btnPrimary"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "Saving..."
                      : editingTenant
                      ? "Update Tenant"
                      : "Create Tenant"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingTenant(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
