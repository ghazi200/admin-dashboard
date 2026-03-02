import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Card from "../components/Card";
import SitesMap from "../components/SitesMap";
import { getOwnerDashboardSummary, getGeographicSites } from "../services/api";

// Clickable location name that toggles a dropdown of address(es)
function LocationWithAddress({ name, siteId, addresses, openKey, thisKey, onToggle }) {
  const ref = useRef(null);
  const isOpen = openKey === thisKey;
  const lines = Array.isArray(addresses) ? addresses : addresses ? [addresses] : [];

  useEffect(() => {
    if (!isOpen) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onToggle(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [isOpen, onToggle]);

  return (
    <td ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(isOpen ? null : thisKey);
        }}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--link, #2563eb)",
          textDecoration: "underline",
          fontWeight: "inherit",
          fontSize: "inherit",
          textAlign: "left",
        }}
      >
        {name}
      </button>
      {isOpen && lines.length > 0 && (
        <ul
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            margin: 0,
            padding: "8px 12px",
            listStyle: "none",
            background: "var(--panel, #fff)",
            border: "1px solid var(--border, #e2e8f0)",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 10,
            minWidth: 200,
            maxWidth: 360,
          }}
        >
          {lines.map((line, i) => (
            <li key={i} style={{ marginBottom: i < lines.length - 1 ? 6 : 0, fontSize: 13, color: "var(--text, #0f172a)" }}>
              {line}
            </li>
          ))}
        </ul>
      )}
      {isOpen && lines.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            padding: "8px 12px",
            background: "var(--panel, #fff)",
            border: "1px solid var(--border, #e2e8f0)",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 10,
            fontSize: 13,
            color: "var(--muted)",
          }}
        >
          No address on file
        </div>
      )}
    </td>
  );
}

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const [openLocationKey, setOpenLocationKey] = useState(null);

  const {
    data: summary,
    isLoading,
    error: summaryError,
  } = useQuery({
    queryKey: ["owner-dashboard-summary"],
    queryFn: async () => {
      const res = await getOwnerDashboardSummary();
      return res.data;
    },
  });

  const { data: sitesData } = useQuery({
    queryKey: ["geographicSites-owner"],
    queryFn: async () => {
      const res = await getGeographicSites();
      const list = res.data?.data ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: !!summary && !summary?.message?.toLowerCase().includes("no tenant"),
  });
  const mapSites = Array.isArray(sitesData) ? sitesData : [];
  // Lookups for address dropdowns: by site id and by location name (cost table uses name from shifts)
  const siteById = React.useMemo(() => {
    const m = new Map();
    (mapSites || []).forEach((s) => {
      if (s?.id != null) m.set(String(s.id), s);
    });
    return m;
  }, [mapSites]);
  const addressLinesByName = React.useMemo(() => {
    const m = new Map();
    (mapSites || []).forEach((s) => {
      const name = (s?.name ?? "").trim().toLowerCase();
      if (!name) return;
      const lines = s.addressLines ?? (s.address ? [s.address] : []);
      if (!m.has(name)) m.set(name, []);
      m.get(name).push(...lines);
    });
    return m;
  }, [mapSites]);

  const noTenant = summary?.message?.toLowerCase().includes("no tenant");
  const totalLocations = summary?.totalLocations ?? 0;
  const totalGuards = summary?.totalGuards ?? 0;
  const totalSupervisors = summary?.totalSupervisors ?? 0;
  const totalIncidents = summary?.totalIncidents ?? 0;
  const costByLocation = Array.isArray(summary?.costByLocation) ? summary.costByLocation : [];
  const supervisorsByLocation = Array.isArray(summary?.supervisorsByLocation) ? summary.supervisorsByLocation : [];
  const staffList = Array.isArray(summary?.staffList) ? summary.staffList : [];
  const totalCost = costByLocation.reduce((acc, row) => acc + (row.estimatedCost || 0), 0);
  const subscription = summary?.subscription ?? null;

  const getPlanColor = (plan) => {
    switch (plan) {
      case "enterprise":
        return "rgba(168, 85, 247, 0.25)";
      case "pro":
        return "rgba(59, 130, 246, 0.25)";
      case "basic":
        return "rgba(34, 197, 94, 0.25)";
      default:
        return "rgba(107, 114, 128, 0.2)";
    }
  };
  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "#22c55e";
      case "trial":
        return "#3b82f6";
      case "suspended":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, color: "var(--text, #0f172a)", background: "var(--panel, #fff)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, fontWeight: 800, fontSize: 26 }}>Owner Dashboard</h1>
        <button type="button" className="btn btnPrimary" onClick={() => navigate("/supervisor")}>
          Ask AI AGENT 24
        </button>
      </div>
      <p style={{ marginBottom: 24, color: "var(--muted)", fontSize: 14 }}>
        Company-wide summary for your tenant. Use AI AGENT 24 to ask questions about your data.
      </p>

      {noTenant && (
        <Card title="No tenant" style={{ marginBottom: 24 }}>
          <p style={{ color: "var(--muted)" }}>{summary?.message}</p>
        </Card>
      )}

      {summaryError && (
        <p style={{ marginBottom: 24, padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 8 }}>
          {summaryError?.response?.data?.message || summaryError?.message || "Failed to load summary"}
        </p>
      )}

      {isLoading && <p style={{ marginBottom: 24, color: "var(--muted)" }}>Loading…</p>}

      {!noTenant && !isLoading && summary && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
            <Card title="Locations" subtitle="Sites / buildings" style={{ margin: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{totalLocations}</div>
            </Card>
            <Card title="Guards" subtitle="Staff count" style={{ margin: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{totalGuards}</div>
            </Card>
            <Card title="Supervisors" subtitle="Supervisor accounts" style={{ margin: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{totalSupervisors}</div>
            </Card>
            <Card title="Incidents" subtitle="Total reported" style={{ margin: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{totalIncidents}</div>
            </Card>
            <Card title="Est. labor cost" subtitle="From closed shifts" style={{ margin: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>${totalCost.toLocaleString()}</div>
            </Card>
          </div>

          {subscription && (
            <Card title="Subscription / Plan" subtitle="Your current plan and limits" style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 0",
                  borderLeft: `4px solid ${getStatusColor(subscription.status)}`,
                  paddingLeft: 16,
                  background: getPlanColor(subscription.subscription_plan),
                  borderRadius: 8,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    background: "var(--panel, #fff)",
                    color: "var(--text, #0f172a)",
                  }}
                >
                  {String(subscription.subscription_plan || "free").toUpperCase()}
                </span>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    background: getStatusColor(subscription.status),
                    color: "#fff",
                  }}
                >
                  {String(subscription.status || "active").toUpperCase()}
                </span>
                {subscription.trial_ends_at && (
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    Trial ends: {new Date(subscription.trial_ends_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, fontSize: 14 }}>
                <div>
                  <span style={{ color: "var(--muted)" }}>Max guards</span>
                  <div style={{ fontWeight: 600 }}>{subscription.max_guards != null ? subscription.max_guards : "Unlimited"}</div>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Max locations</span>
                  <div style={{ fontWeight: 600 }}>{subscription.max_locations != null ? subscription.max_locations : "Unlimited"}</div>
                </div>
                {subscription.monthly_amount != null && subscription.monthly_amount > 0 && (
                  <div>
                    <span style={{ color: "var(--muted)" }}>Monthly</span>
                    <div style={{ fontWeight: 600 }}>${Number(subscription.monthly_amount).toLocaleString()}</div>
                  </div>
                )}
              </div>
              <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12, color: "var(--muted)" }}>
                Plan and limits are set by your administrator. Contact support to change your subscription.
              </p>
            </Card>
          )}

          <Card title="Staff list" subtitle="Name, title, and contact — maintained by admin" style={{ marginBottom: 24 }}>
            {staffList.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No staff entries yet. Admins can add staff from the Staff page.</p>
            ) : (
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.title}</td>
                      <td>{row.contact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="All locations" subtitle="Your sites on the map" style={{ marginBottom: 24 }}>
            <SitesMap sites={mapSites} height={420} />
            {mapSites.length > 0 && (
              <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: "var(--muted)" }}>
                {mapSites.filter((s) => s.latitude != null && s.longitude != null).length} of {mapSites.length} location(s) with coordinates shown.
              </p>
            )}
          </Card>

          <Card title="Cost by location" subtitle="Estimated cost from closed shifts (8 hrs × pay rate or $15/hr default)" style={{ marginBottom: 24 }}>
            {costByLocation.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No closed shifts with location data yet.</p>
            ) : (
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Location</th>
                    <th style={{ textAlign: "right" }}>Shifts</th>
                    <th style={{ textAlign: "right" }}>Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {costByLocation.map((row, i) => (
                    <tr key={i}>
                      <LocationWithAddress
                        name={row.locationName ?? "—"}
                        addresses={addressLinesByName.get((row.locationName ?? "").trim().toLowerCase()) ?? []}
                        openKey={openLocationKey}
                        thisKey={`cost-${i}`}
                        onToggle={setOpenLocationKey}
                      />
                      <td style={{ textAlign: "right" }}>{row.shiftCount}</td>
                      <td style={{ textAlign: "right" }}>${(row.estimatedCost || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Supervisor by location" subtitle="Assigned supervisor per site (configure in site settings when available)" style={{ marginBottom: 24 }}>
            {supervisorsByLocation.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No sites in your tenant yet.</p>
            ) : (
              <table className="table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Supervisor</th>
                  </tr>
                </thead>
                <tbody>
                  {supervisorsByLocation.map((row) => {
                    const site = siteById.get(String(row.siteId));
                    const addresses = site?.addressLines ?? (site?.address ? [site.address] : []);
                    return (
                      <tr key={row.siteId}>
                        <LocationWithAddress
                          name={row.siteName ?? "—"}
                          siteId={row.siteId}
                          addresses={addresses}
                          openKey={openLocationKey}
                          thisKey={`supervisor-${row.siteId}`}
                          onToggle={setOpenLocationKey}
                        />
                        <td>{row.supervisorName}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="AI AGENT 24" subtitle="Ask questions about your company data">
            <p style={{ marginBottom: 12, color: "var(--muted)", fontSize: 14 }}>
              Get explanations, trends, and answers about locations, guards, incidents, and costs.
            </p>
            <button type="button" className="btn btnPrimary" onClick={() => navigate("/supervisor")}>
              Open AI AGENT 24
            </button>
          </Card>
        </>
      )}
    </div>
  );
}
