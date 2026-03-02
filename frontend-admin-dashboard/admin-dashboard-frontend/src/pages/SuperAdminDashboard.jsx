import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { connectSocket } from "../realtime/socket";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  listTenants,
  deleteTenant,
  getTenantStats,
  getSuperAdminAnalytics,
  getSuperAdminIncidents,
  getCompanyRankings,
} from "../services/superAdmin";
import Card from "../components/Card";

const COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899"];

// AI Assistant Component
function AIAssistant({ tenants, analytics, incidents }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const aiResponse = generateAIResponse(input, tenants, analytics, incidents);
      setMessages((prev) => [...prev, { role: "assistant", content: aiResponse }]);
      setIsTyping(false);
    }, 1000);
  };

  function generateAIResponse(query, tenants, analytics, incidents) {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes("incident")) {
      const total = incidents?.total || 0;
      const open = incidents?.statusBreakdown?.find((s) => s.status === "OPEN")?.count || 0;
      return `Total incidents: ${total}. Currently open: ${open}. I can help you track incident trends and status breakdown.`;
    }

    if (lowerQuery.includes("total") || lowerQuery.includes("how many")) {
      return `You currently have ${analytics?.total_tenants || 0} total tenants. ${analytics?.active_tenants || 0} are active, ${analytics?.trial_tenants || 0} are on trial, and ${analytics?.suspended_tenants || 0} are suspended.`;
    }

    if (lowerQuery.includes("revenue") || lowerQuery.includes("money")) {
      const totalRevenue = analytics?.total_monthly_revenue || 0;
      return `Total monthly revenue: $${totalRevenue.toLocaleString()}. You have ${analytics?.enterprise_tenants || 0} enterprise, ${analytics?.pro_tenants || 0} pro, ${analytics?.basic_tenants || 0} basic, and ${analytics?.free_tenants || 0} free plans.`;
    }

    if (lowerQuery.includes("guards") || lowerQuery.includes("staff")) {
      return `Total guards across all tenants: ${analytics?.total_guards || 0}. Total admins: ${analytics?.total_admins || 0}.`;
    }

    return `I understand you're asking about "${query}". Based on your platform: ${analytics?.total_tenants || 0} tenants, ${analytics?.total_guards || 0} guards, $${analytics?.total_monthly_revenue || 0} monthly revenue, and ${incidents?.total || 0} incidents. How can I help you further?`;
  }

  return (
    <Card
      title="🤖 AI Assistant - Agent 24"
      style={{ marginBottom: 20, maxHeight: "400px", display: "flex", flexDirection: "column" }}
    >
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 15, minHeight: 150 }}>
        {messages.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", opacity: 0.7 }}>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🤖</div>
            <div>Hi! I'm Agent 24, your AI assistant.</div>
            <div style={{ marginTop: 10, fontSize: 12 }}>
              Ask me about tenants, revenue, guards, incidents, or rankings!
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: msg.role === "user" ? "rgba(59, 130, 246, 0.1)" : "rgba(34, 197, 94, 0.1)",
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                  {msg.role === "user" ? "You" : "Agent 24"}
                </div>
                <div style={{ fontSize: 13 }}>{msg.content}</div>
              </div>
            ))}
            {isTyping && (
              <div style={{ padding: 12, borderRadius: 8, background: "rgba(34, 197, 94, 0.1)", alignSelf: "flex-start" }}>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Agent 24</div>
                <div style={{ fontSize: 13 }}>Thinking...</div>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask me anything..."
          style={{
            flex: 1,
            padding: "10px 15px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.05)",
            color: "#fff",
            fontSize: 13,
          }}
        />
        <button
          className="btn btnPrimary"
          onClick={handleSend}
          disabled={!input.trim() || isTyping}
          style={{ minWidth: 80 }}
        >
          Send
        </button>
      </div>
    </Card>
  );
}

// Tenant Card Component
function TenantCard({ tenant, onEdit, onDelete, onViewStats, rank }) {
  const getPlanColor = (plan) => {
    switch (plan) {
      case "enterprise":
        return "rgba(168, 85, 247, 0.2)";
      case "pro":
        return "rgba(59, 130, 246, 0.2)";
      case "basic":
        return "rgba(34, 197, 94, 0.2)";
      default:
        return "rgba(107, 114, 128, 0.2)";
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "rgba(34, 197, 94, 0.3)";
      case "trial":
        return "rgba(59, 130, 246, 0.3)";
      case "suspended":
        return "rgba(239, 68, 68, 0.3)";
      default:
        return "rgba(107, 114, 128, 0.3)";
    }
  };

  const getTrendIcon = (trend) => {
    if (trend === "growing") return "📈";
    if (trend === "declining") return "📉";
    return "➡️";
  };

  const getTrendColor = (trend) => {
    if (trend === "growing") return "#22c55e";
    if (trend === "declining") return "#ef4444";
    return "#6b7280";
  };

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: getPlanColor(tenant.subscription_plan),
        border: `2px solid ${getStatusColor(tenant.status)}`,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        position: "relative",
      }}
    >
      {rank && (
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            padding: "4px 12px",
            borderRadius: 20,
            background: rank <= 3 ? "rgba(251, 191, 36, 0.3)" : "rgba(107, 114, 128, 0.3)",
            fontSize: 12,
            fontWeight: 900,
            color: "#fff",
          }}
        >
          #{rank}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 18, marginBottom: 8 }}>{tenant.name}</h3>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
            {tenant.location ? `📍 ${tenant.location}` : "📍 Location not set"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "4px 12px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                background: getStatusColor(tenant.status),
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
                background: getPlanColor(tenant.subscription_plan),
                color: "#fff",
              }}
            >
              {tenant.subscription_plan?.toUpperCase()}
            </span>
            {tenant.trend && (
              <span
                style={{
                  padding: "4px 12px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  background: getTrendColor(tenant.trend),
                  color: "#fff",
                }}
              >
                {getTrendIcon(tenant.trend)} {tenant.trend?.toUpperCase()}
              </span>
            )}
          </div>
          {tenant.growth_rate !== undefined && (
            <div style={{ marginTop: 8, fontSize: 12, color: getTrendColor(tenant.trend) }}>
              Growth: {tenant.growth_rate > 0 ? "+" : ""}{tenant.growth_rate.toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 8 }}>
        <div style={{ padding: 10, background: "rgba(0,0,0,0.1)", borderRadius: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#3b82f6" }}>
            {tenant.guard_count || 0}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Guards/Staff</div>
        </div>
        <div style={{ padding: 10, background: "rgba(0,0,0,0.1)", borderRadius: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#22c55e" }}>
            ${(tenant.monthly_amount || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Monthly Amount</div>
        </div>
        <div style={{ padding: 10, background: "rgba(0,0,0,0.1)", borderRadius: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#fb923c" }}>
            {tenant.admin_count || 0}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Admins</div>
        </div>
        <div style={{ padding: 10, background: "rgba(0,0,0,0.1)", borderRadius: 8 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#a855f7" }}>
            {tenant.shift_count || 0}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Shifts</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
        <button
          className="btn"
          onClick={() => onViewStats(tenant.id)}
          style={{ fontSize: 11, padding: "6px 12px", flex: 1 }}
        >
          📊 Stats
        </button>
        <button
          className="btn"
          onClick={() => onEdit(tenant)}
          style={{ fontSize: 11, padding: "6px 12px", flex: 1 }}
        >
          ✏️ Edit
        </button>
        <button
          className="btn"
          onClick={() => onDelete(tenant.id)}
          style={{
            fontSize: 11,
            padding: "6px 12px",
            background: "rgba(239, 68, 68, 0.2)",
            color: "#ef4444",
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

export default function SuperAdminDashboard() {
  const queryClient = useQueryClient();
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Fetch tenants with all data
  const { data: tenants, isLoading: tenantsLoading, isRefetching: tenantsRefetching, error: tenantsError } = useQuery({
    queryKey: ["superAdminTenants"],
    queryFn: async () => {
      console.log("🔄 Fetching tenants...");
      try {
        const response = await listTenants();
        console.log("✅ Tenants fetched:", response.data?.length || 0, response.data);
        return response.data;
      } catch (error) {
        console.error("❌ Error fetching tenants:", error);
        throw error;
      }
    },
    refetchInterval: 15000, // Refresh every 15 seconds
    refetchOnWindowFocus: true,
  });

  // Fetch analytics
  const { data: analytics, isLoading: analyticsLoading, isRefetching: analyticsRefetching, error: analyticsError } = useQuery({
    queryKey: ["superAdminAnalytics"],
    queryFn: async () => {
      console.log("🔄 Fetching analytics...");
      try {
        const response = await getSuperAdminAnalytics();
        console.log("✅ Analytics fetched:", response.data);
        return response.data;
      } catch (error) {
        console.error("❌ Error fetching analytics:", error);
        throw error;
      }
    },
    refetchInterval: 15000, // Refresh every 15 seconds
    refetchOnWindowFocus: true,
  });

  // Fetch incidents
  const { data: incidents, isLoading: incidentsLoading, isRefetching: incidentsRefetching, error: incidentsError } = useQuery({
    queryKey: ["superAdminIncidents"],
    queryFn: async () => {
      console.log("🔄 Fetching incidents...");
      try {
        const response = await getSuperAdminIncidents();
        console.log("✅ Incidents fetched:", response.data);
        return response.data;
      } catch (error) {
        console.error("❌ Error fetching incidents:", error);
        // Return empty structure on error
        return { incidents: [], statusBreakdown: [], byTenant: [], total: 0 };
      }
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchOnWindowFocus: true,
  });

  // Fetch company rankings
  const { data: rankings, isLoading: rankingsLoading, isRefetching: rankingsRefetching } = useQuery({
    queryKey: ["companyRankings"],
    queryFn: async () => {
      const response = await getCompanyRankings(30);
      return response.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchOnWindowFocus: true,
  });

  // Merge rankings with tenants
  const tenantsWithRankings = React.useMemo(() => {
    if (!tenants || !rankings) return tenants || [];
    return tenants.map((tenant) => {
      const ranking = rankings.find((r) => r.id === tenant.id);
      return ranking ? { ...tenant, ...ranking } : tenant;
    });
  }, [tenants, rankings]);

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

  // Real-time updates via Socket.IO
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;

    const refreshAll = () => {
      console.log("🔄 Refreshing super-admin dashboard...");
      setLastUpdate(new Date());
      queryClient.invalidateQueries({ queryKey: ["superAdminTenants"] });
      queryClient.invalidateQueries({ queryKey: ["superAdminAnalytics"] });
      queryClient.invalidateQueries({ queryKey: ["superAdminIncidents"] });
      queryClient.invalidateQueries({ queryKey: ["companyRankings"] });
    };

    const attachListeners = () => {
      socket.on("shift_created", refreshAll);
      socket.on("shift_updated", refreshAll);
      socket.on("callout_started", refreshAll);
      socket.on("guard_clocked_in", refreshAll);
      socket.on("guard_clocked_out", refreshAll);
      socket.on("incidents:new", refreshAll);
      socket.on("incidents:updated", refreshAll);
    };

    attachListeners();
    socket.on("connect", attachListeners);
    socket.on("reconnect", attachListeners);

    return () => {
      socket.off("shift_created", refreshAll);
      socket.off("shift_updated", refreshAll);
      socket.off("callout_started", refreshAll);
      socket.off("guard_clocked_in", refreshAll);
      socket.off("guard_clocked_out", refreshAll);
      socket.off("incidents:new", refreshAll);
      socket.off("incidents:updated", refreshAll);
      socket.off("connect", attachListeners);
      socket.off("reconnect", attachListeners);
    };
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: deleteTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superAdminTenants"] });
      queryClient.invalidateQueries({ queryKey: ["superAdminAnalytics"] });
    },
  });

  function handleDelete(tenantId) {
    if (window.confirm("Delete this tenant? This will deactivate the tenant.")) {
      deleteMutation.mutate(tenantId);
    }
  }

  function handleEdit(tenant) {
    window.location.href = `/super-admin/manage`;
  }

  function handleViewStats(tenantId) {
    setSelectedTenant(tenantId);
  }

  // Prepare chart data
  const statusChartData = incidents?.statusBreakdown?.map((item) => ({
    name: item.status || "Unknown",
    value: parseInt(item.count) || 0,
  })) || [];

  const incidentsByTenantData = incidents?.byTenant?.slice(0, 10).map((item) => ({
    name: item.tenant_name?.substring(0, 20) || "Unknown",
    total: parseInt(item.incident_count) || 0,
    open: parseInt(item.open_count) || 0,
    resolved: parseInt(item.resolved_count) || 0,
  })) || [];

  const growthChartData = rankings?.slice(0, 10).map((item) => ({
    name: item.name?.substring(0, 15) || "Unknown",
    growth: parseFloat(item.growth_rate) || 0,
  })) || [];

  const planDistributionData = [
    { name: "Enterprise", value: analytics?.enterprise_tenants || 0 },
    { name: "Pro", value: analytics?.pro_tenants || 0 },
    { name: "Basic", value: analytics?.basic_tenants || 0 },
    { name: "Free", value: analytics?.free_tenants || 0 },
  ].filter((item) => item.value > 0);

  const isRefreshing = tenantsRefetching || analyticsRefetching || incidentsRefetching || rankingsRefetching;
  const isLoading = tenantsLoading || analyticsLoading || incidentsLoading || rankingsLoading;

  // Debug: Log data status
  React.useEffect(() => {
    console.log("📊 Super Admin Dashboard Data Status:", {
      tenants: tenants?.length || 0,
      analytics: !!analytics,
      incidents: incidents?.total || 0,
      rankings: rankings?.length || 0,
      tenantsLoading,
      analyticsLoading,
      incidentsLoading,
      rankingsLoading,
      tenantsError: tenantsError?.message || tenantsError?.response?.data?.message,
      analyticsError: analyticsError?.message || analyticsError?.response?.data?.message,
      incidentsError: incidentsError?.message || incidentsError?.response?.data?.message,
    });
  }, [tenants, analytics, incidents, rankings, tenantsLoading, analyticsLoading, incidentsLoading, rankingsLoading, tenantsError, analyticsError, incidentsError]);

  // Show loading state
  if (isLoading && !tenants && !analytics && !incidents) {
    return (
      <div className="container">
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
          <div style={{ opacity: 0.7 }}>Loading super-admin dashboard data...</div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.5 }}>
            Fetching tenants, analytics, incidents, and rankings...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>🏢 Super-Admin Dashboard</h1>
          <div style={{ marginTop: 4, opacity: 0.7, fontSize: 13 }}>
            Platform overview, tenant management, and AI assistance
            {isRefreshing && <span style={{ marginLeft: 10, color: "#22c55e" }}>🔄 Live updating...</span>}
          </div>
          {(tenantsError || analyticsError || incidentsError) && (
            <div style={{ marginTop: 8, padding: 10, background: "rgba(239, 68, 68, 0.2)", borderRadius: 8, fontSize: 12 }}>
              ⚠️ Error loading data. Check console for details.
              {tenantsError && <div>Tenants: {tenantsError?.response?.data?.message || tenantsError?.message || "Unknown error"}</div>}
              {analyticsError && <div>Analytics: {analyticsError?.response?.data?.message || analyticsError?.message || "Unknown error"}</div>}
              {incidentsError && <div>Incidents: {incidentsError?.response?.data?.message || incidentsError?.message || "Unknown error"}</div>}
              <button
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["superAdminTenants"] });
                  queryClient.invalidateQueries({ queryKey: ["superAdminAnalytics"] });
                  queryClient.invalidateQueries({ queryKey: ["superAdminIncidents"] });
                }}
                style={{
                  marginTop: 8,
                  padding: "6px 12px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, opacity: 0.6 }}>
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      </div>

      {/* Summary Statistics */}
      {analyticsLoading && (
        <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>
          Loading analytics...
        </div>
      )}
      {!analyticsLoading && !analytics && (
        <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>
          No analytics data available. Check console for errors.
        </div>
      )}
      {!analyticsLoading && analytics && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 15, marginBottom: 20 }}>
          <Card title="Total Tenants" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#3b82f6", marginBottom: 8 }}>
              {analytics.total_tenants || 0}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {analytics.active_tenants || 0} Active • {analytics.trial_tenants || 0} Trial
            </div>
          </Card>

          <Card title="Total Guards/Staff" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#22c55e", marginBottom: 8 }}>
              {analytics.total_guards || 0}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Across all tenants</div>
          </Card>

          <Card title="Total Revenue" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#f59e0b", marginBottom: 8 }}>
              ${(analytics.total_monthly_revenue || 0).toLocaleString()}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Monthly</div>
          </Card>

          <Card title="Total Incidents" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#ef4444", marginBottom: 8 }}>
              {incidents?.total || 0}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {Array.isArray(incidents?.statusBreakdown) 
                ? (incidents.statusBreakdown.find((s) => s.status === "OPEN")?.count || 0)
                : 0} Open
              {Array.isArray(incidents?.statusBreakdown) && incidents.statusBreakdown.length > 0 && (
                <span style={{ marginLeft: 8 }}>
                  • {incidents.statusBreakdown.find((s) => s.status === "RESOLVED")?.count || 0} Resolved
                </span>
              )}
            </div>
          </Card>

          <Card title="Subscription Plans" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#a855f7", marginBottom: 8 }}>
              {analytics.enterprise_tenants || 0}E / {analytics.pro_tenants || 0}P
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {analytics.basic_tenants || 0} Basic • {analytics.free_tenants || 0} Free
            </div>
          </Card>
        </div>
      )}

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20, marginBottom: 20 }}>
        {/* Incidents Status Breakdown */}
        <Card title="Incidents by Status">
          {incidentsLoading ? (
            <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
          ) : statusChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>No incidents data</div>
          )}
        </Card>

        {/* Subscription Plan Distribution */}
        <Card title="Subscription Plan Distribution">
          {analyticsLoading ? (
            <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
          ) : planDistributionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={planDistributionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>No plan data</div>
          )}
        </Card>

        {/* Company Growth Rankings */}
        <Card title="Company Growth Rankings (Top 10)">
          {rankingsLoading ? (
            <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
          ) : growthChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={growthChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="growth" fill="#22c55e">
                  {growthChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.growth > 0 ? "#22c55e" : entry.growth < 0 ? "#ef4444" : "#6b7280"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>No growth data</div>
          )}
        </Card>

        {/* Incidents by Tenant */}
        <Card title="Incidents by Tenant (Top 10)">
          {incidentsLoading ? (
            <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
          ) : incidentsByTenantData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={incidentsByTenantData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="open" stackId="a" fill="#ef4444" />
                <Bar dataKey="resolved" stackId="a" fill="#22c55e" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>No incidents by tenant</div>
          )}
        </Card>
      </div>

      {/* AI Assistant */}
      <AIAssistant tenants={tenants} analytics={analytics} incidents={incidents} />

      {/* Company Rankings Table */}
      {rankings && rankings.length > 0 && (
        <Card title="Company Rankings & Growth" style={{ marginBottom: 20 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid rgba(255,255,255,0.1)" }}>
                  <th style={{ padding: 12, textAlign: "left", fontSize: 12, fontWeight: 600 }}>Rank</th>
                  <th style={{ padding: 12, textAlign: "left", fontSize: 12, fontWeight: 600 }}>Company</th>
                  <th style={{ padding: 12, textAlign: "left", fontSize: 12, fontWeight: 600 }}>Location</th>
                  <th style={{ padding: 12, textAlign: "center", fontSize: 12, fontWeight: 600 }}>Guards</th>
                  <th style={{ padding: 12, textAlign: "center", fontSize: 12, fontWeight: 600 }}>Growth</th>
                  <th style={{ padding: 12, textAlign: "center", fontSize: 12, fontWeight: 600 }}>Trend</th>
                  <th style={{ padding: 12, textAlign: "center", fontSize: 12, fontWeight: 600 }}>Plan</th>
                </tr>
              </thead>
              <tbody>
                {rankings.slice(0, 20).map((company, idx) => (
                  <tr key={company.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: 12, fontSize: 14, fontWeight: 900 }}>
                      {idx < 3 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${company.rank || idx + 1}`}
                    </td>
                    <td style={{ padding: 12, fontSize: 13, fontWeight: 600 }}>{company.name}</td>
                    <td style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>{company.location || "—"}</td>
                    <td style={{ padding: 12, textAlign: "center", fontSize: 13 }}>{company.guard_count || 0}</td>
                    <td
                      style={{
                        padding: 12,
                        textAlign: "center",
                        fontSize: 13,
                        fontWeight: 600,
                        color: company.growth_rate > 0 ? "#22c55e" : company.growth_rate < 0 ? "#ef4444" : "#6b7280",
                      }}
                    >
                      {company.growth_rate > 0 ? "+" : ""}
                      {company.growth_rate?.toFixed(1)}%
                    </td>
                    <td style={{ padding: 12, textAlign: "center", fontSize: 16 }}>
                      {company.trend === "growing" ? "📈" : company.trend === "declining" ? "📉" : "➡️"}
                    </td>
                    <td style={{ padding: 12, textAlign: "center", fontSize: 11 }}>
                      {company.subscription_plan?.toUpperCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tenants Grid */}
      <Card
        title={`All Tenants (${tenants?.length || 0})`}
        right={
          <button
            className="btn btnPrimary"
            onClick={() => {
              window.location.href = "/super-admin/manage";
            }}
          >
            + New Tenant
          </button>
        }
      >
        {tenantsLoading ? (
          <div style={{ padding: 40, textAlign: "center" }}>Loading tenants...</div>
        ) : tenantsError ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <div style={{ color: "#ef4444", marginBottom: 10 }}>
              Error loading tenants: {tenantsError?.response?.data?.message || tenantsError?.message || "Unknown error"}
            </div>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["superAdminTenants"] })}
              style={{
                padding: "8px 16px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        ) : tenantsWithRankings?.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", opacity: 0.7 }}>
            No tenants found. Create your first tenant to get started.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: 20 }}>
            {tenantsWithRankings?.map((tenant) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onViewStats={handleViewStats}
                rank={tenant.rank}
              />
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
    </div>
  );
}
