// src/pages/Analytics.jsx
import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { connectSocket } from "../realtime/socket";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import Card from "../components/Card";
import {
  getAnalyticsKPIs,
  getAnalyticsTrends,
  getAnalyticsPerformance,
  getAnalyticsComparative,
} from "../services/api";
import { hasAccess } from "../utils/access";

const COLORS = ["#4f46e5", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6"];

export default function Analytics() {
  const canReadAnalytics = hasAccess("dashboard:read");
  const [selectedDays, setSelectedDays] = useState(30);
  const queryClient = useQueryClient();
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // Real-time KPIs - refresh every 15 seconds
  const { data: kpis, isLoading: kpisLoading, isRefetching: kpisRefetching, error: kpisError } = useQuery({
    queryKey: ["analytics-kpis"],
    queryFn: async () => {
      const response = await getAnalyticsKPIs();
      // Axios wraps response, so response.data is the actual API response
      return response.data;
    },
    enabled: canReadAnalytics,
    refetchInterval: canReadAnalytics ? 15000 : false, // Refresh every 15 seconds
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Trend Analysis - refresh every 30 seconds
  const { data: trends, isLoading: trendsLoading, isRefetching: trendsRefetching, error: trendsError } = useQuery({
    queryKey: ["analytics-trends", selectedDays],
    queryFn: async () => {
      const response = await getAnalyticsTrends(selectedDays);
      return response.data;
    },
    enabled: canReadAnalytics,
    refetchInterval: canReadAnalytics ? 30000 : false, // Refresh every 30 seconds
    refetchOnWindowFocus: true,
  });

  // Performance Metrics - refresh every 30 seconds
  const { data: performance, isLoading: performanceLoading, isRefetching: performanceRefetching, error: performanceError } = useQuery({
    queryKey: ["analytics-performance", selectedDays],
    queryFn: async () => {
      const response = await getAnalyticsPerformance(selectedDays);
      return response.data;
    },
    enabled: canReadAnalytics,
    refetchInterval: canReadAnalytics ? 30000 : false, // Refresh every 30 seconds
    refetchOnWindowFocus: true,
  });

  // Comparative Analytics - refresh every 60 seconds
  const { data: comparative, isLoading: comparativeLoading, error: comparativeError, isRefetching: comparativeRefetching } = useQuery({
    queryKey: ["analytics-comparative"],
    queryFn: async () => {
      const response = await getAnalyticsComparative();
      return response.data;
    },
    enabled: canReadAnalytics,
    refetchInterval: canReadAnalytics ? 60000 : false, // Refresh every 60 seconds
    refetchOnWindowFocus: true,
    retry: 1,
  });

  // Real-time updates via Socket.IO
  useEffect(() => {
    if (!canReadAnalytics) return;

    const socket = connectSocket();
    if (!socket) return;

    const refreshAnalytics = () => {
      console.log("🔄 Refreshing analytics data via socket event...");
      setLastUpdate(new Date());
      // Invalidate and refetch all analytics queries
      queryClient.invalidateQueries({ queryKey: ["analytics-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-trends"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-performance"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-comparative"] });
    };

    // Listen for events that affect analytics
    socket.on("callout:created", refreshAnalytics);
    socket.on("callout:filled", refreshAnalytics);
    socket.on("shift:created", refreshAnalytics);
    socket.on("shift:filled", refreshAnalytics);
    socket.on("shift:closed", refreshAnalytics);
    socket.on("guard:availability_changed", refreshAnalytics);

    return () => {
      socket.off("callout:created", refreshAnalytics);
      socket.off("callout:filled", refreshAnalytics);
      socket.off("shift:created", refreshAnalytics);
      socket.off("shift:filled", refreshAnalytics);
      socket.off("shift:closed", refreshAnalytics);
      socket.off("guard:availability_changed", refreshAnalytics);
    };
  }, [canReadAnalytics, queryClient]);

  // Update last update time when any query refetches
  useEffect(() => {
    if (kpisRefetching || trendsRefetching || performanceRefetching || comparativeRefetching) {
      setLastUpdate(new Date());
    }
  }, [kpisRefetching, trendsRefetching, performanceRefetching, comparativeRefetching]);

  if (!canReadAnalytics) {
    return (
      <div style={{ padding: 24 }}>
        <Card>
          <p>You don't have permission to view analytics.</p>
        </Card>
      </div>
    );
  }

  // Debug: Log data to console
  useEffect(() => {
    console.log("📊 Analytics Data Debug:", {
      kpis,
      trends,
      performance,
      comparative,
      kpisError: kpisError?.message,
      trendsError: trendsError?.message,
      performanceError: performanceError?.message,
      comparativeError: comparativeError?.message,
      kpisLoading,
      trendsLoading,
      performanceLoading,
      comparativeLoading,
    });
  }, [kpis, trends, performance, comparative, kpisError, trendsError, performanceError, comparativeError, kpisLoading, trendsLoading, performanceLoading, comparativeLoading]);

  // Show error messages if any
  if (kpisError || trendsError || performanceError || comparativeError) {
    return (
      <div style={{ padding: 24 }}>
        <Card>
          <h2 style={{ color: "#ef4444", marginBottom: 16 }}>⚠️ Error Loading Analytics</h2>
          {kpisError && <p>KPIs Error: {kpisError.message}</p>}
          {trendsError && <p>Trends Error: {trendsError.message}</p>}
          {performanceError && <p>Performance Error: {performanceError.message}</p>}
          {comparativeError && <p>Comparative Error: {comparativeError.message}</p>}
        </Card>
      </div>
    );
  }

  // Prepare chart data with safe access
  const trendChartData = trends?.labels && trends?.data ? trends.labels.map((label, index) => ({
    date: label,
    "Open Shifts": trends.data?.openShifts?.[index] || 0,
    "Filled Shifts": trends.data?.filledShifts?.[index] || 0,
    Callouts: trends.data?.callouts?.[index] || 0,
    "Coverage Rate": trends.data?.coverageRate?.[index] || 0,
  })) : [];

  const coverageChartData = trends?.labels && trends?.data ? trends.labels.map((label, index) => ({
    date: label,
    "Coverage Rate (%)": trends.data?.coverageRate?.[index] || 0,
  })) : [];

  const guardPerformanceData = performance?.topPerformers ? performance.topPerformers.slice(0, 10).map((guard) => ({
    name: guard.guardName?.substring(0, 15) || "Unknown",
    "Shifts Completed": guard.shiftsCompleted || 0,
    Callouts: guard.callouts || 0,
    Reliability: guard.reliability || 0,
  })) : [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
            📊 Analytics Dashboard
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Real-time KPIs, trend analysis, and performance metrics
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
            {kpisRefetching || trendsRefetching || performanceRefetching || comparativeRefetching ? (
              <span style={{ color: "#4f46e5" }}>🔄 Updating...</span>
            ) : (
              <span style={{ color: "#22c55e" }}>● Live</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Date Range Selector */}
      <div style={{ marginBottom: 24, display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ fontWeight: 600, fontSize: 14 }}>Time Range:</label>
        <select
          value={selectedDays}
          onChange={(e) => setSelectedDays(Number(e.target.value))}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Real-Time KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 24 }}>
        <KPICard
          title="Total Guards"
          value={kpis?.guards?.total || 0}
          subtitle={`${kpis?.guards?.available || 0} available`}
          color="#4f46e5"
          loading={kpisLoading}
        />
        <KPICard
          title="Open Shifts"
          value={kpis?.shifts?.openToday || 0}
          subtitle={`${kpis?.shifts?.openTotal || 0} total open`}
          color="#ef4444"
          loading={kpisLoading}
        />
        <KPICard
          title="Coverage Rate"
          value={`${kpis?.shifts?.coverageRate || 0}%`}
          subtitle={`${kpis?.shifts?.filledToday || 0} filled today`}
          color="#22c55e"
          loading={kpisLoading}
        />
        <KPICard
          title="Callouts Today"
          value={kpis?.callouts?.today || 0}
          subtitle={`${kpis?.callouts?.last7Days || 0} in last 7 days`}
          color="#f59e0b"
          loading={kpisLoading}
        />
        <KPICard
          title="Callout Rate"
          value={`${kpis?.callouts?.calloutRate || 0}%`}
          subtitle="Last 7 days"
          color="#8b5cf6"
          loading={kpisLoading}
        />
        <KPICard
          title="Availability Rate"
          value={`${kpis?.guards?.availabilityRate || 0}%`}
          subtitle={`${kpis?.guards?.available || 0}/${kpis?.guards?.total || 0} guards`}
          color="#06b6d4"
          loading={kpisLoading}
        />
      </div>

      {/* Comparative Analytics */}
      {!comparativeLoading && comparative && comparative.weekOverWeek && comparative.monthOverMonth && (
        <div style={{ marginBottom: 24 }}>
          <Card>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              📈 Comparative Analytics
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              {comparative.weekOverWeek.shifts && (
                <ComparisonCard
                  title="Week-over-Week"
                  metric="Shifts"
                  current={comparative.weekOverWeek.shifts.current || 0}
                  previous={comparative.weekOverWeek.shifts.previous || 0}
                  change={comparative.weekOverWeek.shifts.change || 0}
                />
              )}
              {comparative.weekOverWeek.callouts && (
                <ComparisonCard
                  title="Week-over-Week"
                  metric="Callouts"
                  current={comparative.weekOverWeek.callouts.current || 0}
                  previous={comparative.weekOverWeek.callouts.previous || 0}
                  change={comparative.weekOverWeek.callouts.change || 0}
                />
              )}
              {comparative.monthOverMonth.shifts && (
                <ComparisonCard
                  title="Month-over-Month"
                  metric="Shifts"
                  current={comparative.monthOverMonth.shifts.current || 0}
                  previous={comparative.monthOverMonth.shifts.previous || 0}
                  change={comparative.monthOverMonth.shifts.change || 0}
                />
              )}
              {comparative.monthOverMonth.callouts && (
                <ComparisonCard
                  title="Month-over-Month"
                  metric="Callouts"
                  current={comparative.monthOverMonth.callouts.current || 0}
                  previous={comparative.monthOverMonth.callouts.previous || 0}
                  change={comparative.monthOverMonth.callouts.change || 0}
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Trend Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))", gap: 24, marginBottom: 24 }}>
        {/* Shifts & Callouts Trend */}
        <Card>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
            📊 Shifts & Callouts Trend
          </h2>
          {trendsLoading ? (
            <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="Open Shifts"
                  stackId="1"
                  stroke="#ef4444"
                  fill="#ef4444"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="Filled Shifts"
                  stackId="1"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="Callouts"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.4}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Coverage Rate Trend */}
        <Card>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
            📈 Coverage Rate Trend
          </h2>
          {trendsLoading ? (
            <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={coverageChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="Coverage Rate (%)"
                  stroke="#4f46e5"
                  strokeWidth={3}
                  dot={{ fill: "#4f46e5", r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Guard Performance */}
      {performance && (
        <div style={{ marginBottom: 24 }}>
          <Card>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              🏆 Top Performing Guards
            </h2>
            {performanceLoading ? (
              <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={guardPerformanceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" stroke="#6b7280" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#6b7280"
                    fontSize={12}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Shifts Completed" fill="#22c55e" />
                  <Bar dataKey="Callouts" fill="#ef4444" />
                  <Bar dataKey="Reliability" fill="#4f46e5" />
                </BarChart>
              </ResponsiveContainer>
            )}
            {performance.averageReliability && (
              <div style={{ marginTop: 16, padding: 12, background: "#f3f4f6", borderRadius: 8 }}>
                <strong>Average Reliability:</strong> {performance.averageReliability}%
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Summary Statistics */}
      {trends?.summary && (
        <div style={{ marginBottom: 24 }}>
          <Card>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              📋 Summary Statistics ({selectedDays} days)
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <StatCard
                label="Avg Open Shifts/Day"
                value={trends.summary.avgOpenShifts}
              />
              <StatCard
                label="Avg Filled Shifts/Day"
                value={trends.summary.avgFilledShifts}
              />
              <StatCard
                label="Avg Callouts/Day"
                value={trends.summary.avgCallouts}
              />
              <StatCard
                label="Avg Coverage Rate"
                value={`${trends.summary.avgCoverageRate}%`}
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function KPICard({ title, value, subtitle, color, loading }) {
  if (loading) {
    return (
      <Card>
        <div style={{ padding: 20 }}>
          <div style={{ height: 20, background: "#e5e7eb", borderRadius: 4, marginBottom: 8 }} />
          <div style={{ height: 16, background: "#e5e7eb", borderRadius: 4, width: "60%" }} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ padding: 20 }}>
        <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8, fontWeight: 600 }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: color,
            marginBottom: 4,
          }}
        >
          {value}
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{subtitle}</div>
      </div>
    </Card>
  );
}

function ComparisonCard({ title, metric, current, previous, change }) {
  const isPositive = change >= 0;
  const changeColor = isPositive ? "#22c55e" : "#ef4444";

  return (
    <div
      style={{
        padding: 16,
        background: "#f9fafb",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8, fontWeight: 600 }}>
        {title} - {metric}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>
        {current}
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
        Previous: {previous}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: changeColor,
        }}
      >
        {isPositive ? "↑" : "↓"} {Math.abs(change)}%
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div
      style={{
        padding: 16,
        background: "#f9fafb",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>
        {value}
      </div>
    </div>
  );
}
