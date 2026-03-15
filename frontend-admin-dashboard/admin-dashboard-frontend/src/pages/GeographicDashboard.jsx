/**
 * Geographic Dashboard — interactive map of sites (Google Maps).
 * Includes route optimization and geographic analytics.
 * Requires REACT_APP_GOOGLE_MAPS_API_KEY in .env.
 */
import React, { useEffect, useRef, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getGeographicSites,
  getGeographicSiteDetails,
  createGeographicSite,
  getGeographicAnalytics,
  getGeographicRouteOptimize,
} from "../services/api";

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = 10;

export default function GeographicDashboard() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const routePolylineRef = useRef(null);
  const [mapError, setMapError] = useState("");
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", address: "", latitude: "", longitude: "" });
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState(new Set());
  const [routeResult, setRouteResult] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["geographicSites"],
    queryFn: async () => {
      const res = await getGeographicSites();
      const list = res.data?.data ?? res.data ?? [];
      if (!Array.isArray(list)) return [];
      return list;
    },
  });

  const is404 = error?.response?.status === 404;
  const geographicUnavailableMessage =
    "Geographic API not found (404). Ensure the admin-dashboard backend is running and reachable.";

  const sites = Array.isArray(data) ? data : [];
  const sitesWithCoords = sites.filter((s) => s.latitude != null && s.longitude != null);

  const searchLower = (searchQuery || "").trim().toLowerCase();
  const filteredSites = useMemo(() => {
    if (!searchLower) return sites;
    return sites.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(searchLower) ||
        (s.address || "").toLowerCase().includes(searchLower) ||
        ((s.addressLines || []).some((line) => (line || "").toLowerCase().includes(searchLower)))
    );
  }, [sites, searchLower]);

  const {
    data: siteDetailsData,
    isLoading: siteDetailsLoading,
    error: siteDetailsError,
  } = useQuery({
    queryKey: ["geographicSiteDetails", selectedSiteId],
    queryFn: async () => {
      const res = await getGeographicSiteDetails(selectedSiteId);
      return res.data?.data ?? res.data;
    },
    enabled: !!selectedSiteId,
  });
  const siteDetails = siteDetailsData || null;

  const { data: analyticsData } = useQuery({
    queryKey: ["geographicAnalytics"],
    queryFn: async () => {
      const res = await getGeographicAnalytics();
      return res.data?.data ?? res.data ?? null;
    },
    refetchInterval: 30000,
  });
  const analytics = analyticsData || null;

  const siteIdStr = (id) => (id != null ? String(id).trim().toLowerCase() : "");

  const toggleSiteSelection = (id) => {
    const key = siteIdStr(id);
    if (!key) return;
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleOptimizeRoute = async () => {
    const ids = Array.from(selectedSiteIds);
    if (ids.length < 2) {
      setRouteError("Select at least 2 sites to optimize a route.");
      return;
    }
    setRouteError("");
    setRouteLoading(true);
    setRouteResult(null);
    try {
      const res = await getGeographicRouteOptimize({
        siteIds: ids.slice(), // already normalized strings from Set
      });
      const payload = res.data?.data ?? res.data;
      setRouteResult(payload || null);
      if (payload?.orderedSites?.length === 0) {
        setRouteError(
          payload?.message ||
            "No route found. Selected site IDs may not match current sites or coordinates are missing."
        );
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Failed to optimize route";
      setRouteError(msg);
      setRouteResult(null);
      console.error("Route optimize error:", err?.response?.status, msg, err);
    } finally {
      setRouteLoading(false);
    }
  };

  const clearRoute = () => {
    setRouteResult(null);
    setRouteError("");
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }
  };

  // Load Google Maps script
  useEffect(() => {
    const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setMapError("REACT_APP_GOOGLE_MAPS_API_KEY is not set in .env");
      return;
    }
    if (window.google?.maps) {
      setScriptLoaded(true);
      return;
    }
    const id = "google-maps-script";
    if (document.getElementById(id)) {
      const check = () => {
        if (window.google?.maps) setScriptLoaded(true);
        else setTimeout(check, 100);
      };
      check();
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => setMapError("Failed to load Google Maps");
    script.onload = () => setScriptLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Init map and markers when script and container are ready (rAF so container has size)
  useEffect(() => {
    if (!scriptLoaded || !window.google?.maps || !mapRef.current || mapInstanceRef.current) return;

    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (cancelled || !mapRef.current || mapInstanceRef.current) return;
      const map = new window.google.maps.Map(mapRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
      });
      mapInstanceRef.current = map;
      requestAnimationFrame(() => {
        if (mapInstanceRef.current === map && window.google?.maps?.event) {
          window.google.maps.event.trigger(map, "resize");
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      mapInstanceRef.current = null;
    };
  }, [scriptLoaded]);

  // Update markers when sites change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.google?.maps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    if (sitesWithCoords.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    sitesWithCoords.forEach((site) => {
      const lat = parseFloat(site.latitude);
      const lng = parseFloat(site.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;
      const position = { lat, lng };
      bounds.extend(position);
      const marker = new window.google.maps.Marker({
        position,
        map,
        title: site.name || "Site",
      });
      if (site.name || site.address) {
        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div style="padding:6px;min-width:120px;"><strong>${site.name || "Site"}</strong>${site.address ? `<br/><small>${site.address}</small>` : ""}</div>`,
        });
        marker.addListener("click", () => {
          markersRef.current.forEach((m) => {
            if (m.infoWindow) m.infoWindow.close();
          });
          infoWindow.open(map, marker);
          marker.infoWindow = infoWindow;
          setSelectedSiteId(site.id);
        });
      }
      markersRef.current.push(marker);
    });

    if (sitesWithCoords.length === 1) {
      map.setCenter({ lat: parseFloat(sitesWithCoords[0].latitude), lng: parseFloat(sitesWithCoords[0].longitude) });
      map.setZoom(14);
    } else if (sitesWithCoords.length > 1) {
      map.fitBounds(bounds, 60);
    }
  }, [scriptLoaded, sitesWithCoords]);

  // Draw optimized route polyline when routeResult changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.google?.maps || !routeResult?.orderedSites?.length) {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
      return;
    }
    const path = routeResult.orderedSites
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => ({ lat: parseFloat(s.latitude), lng: parseFloat(s.longitude) }));
    if (path.length < 2) return;
    if (routePolylineRef.current) routePolylineRef.current.setMap(null);
    const polyline = new window.google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#22c55e",
      strokeOpacity: 0.9,
      strokeWeight: 4,
    });
    polyline.setMap(map);
    routePolylineRef.current = polyline;
    const bounds = new window.google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 50);
    return () => {
      if (routePolylineRef.current) {
        routePolylineRef.current.setMap(null);
        routePolylineRef.current = null;
      }
    };
  }, [routeResult]);

  if (mapError) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0 }}>Geographic Dashboard</h1>
        <div className="notice" style={{ background: "#fef2f2", color: "#b91c1c" }}>
          {mapError}. Add it to <code>.env</code> and restart the dev server.
        </div>
      </div>
    );
  }

  const handleAddSite = async (e) => {
    e.preventDefault();
    setAddError("");
    if (!addForm.name.trim()) {
      setAddError("Name is required");
      return;
    }
    setAdding(true);
    try {
      await createGeographicSite({
        name: addForm.name.trim(),
        address: addForm.address.trim() || undefined,
        latitude: addForm.latitude.trim() ? addForm.latitude.trim() : undefined,
        longitude: addForm.longitude.trim() ? addForm.longitude.trim() : undefined,
      });
      qc.invalidateQueries({ queryKey: ["geographicSites"] });
      qc.invalidateQueries({ queryKey: ["geographicAnalytics"] });
      setAddForm({ name: "", address: "", latitude: "", longitude: "" });
      setShowAddForm(false);
    } catch (err) {
      setAddError(err?.response?.data?.message || err?.message || "Failed to add site");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div style={{ padding: 24, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ marginTop: 0, marginBottom: 4 }}>Geographic Dashboard</h1>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Map, route optimization, and geographic analytics for sites.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setShowAddForm((v) => !v)}
          style={{ whiteSpace: "nowrap" }}
        >
          {showAddForm ? "Cancel" : "+ Add site"}
        </button>
      </div>

      {/* Site search / lookup */}
      <div
        style={{
          marginBottom: 16,
          padding: 16,
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--card-bg, rgba(255,255,255,0.02))",
        }}
      >
        <label style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>Search sites</label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name or address…"
          style={{ width: "100%", maxWidth: 400, padding: "10px 14px", borderRadius: 8, marginBottom: 12 }}
        />
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
          {filteredSites.length} site(s) {searchLower ? "matching search" : "total"} — click a site to see staff, supervisor, and guards
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {filteredSites.map((site) => {
            const isSelected = selectedSiteId === site.id;
            return (
              <button
                key={site.id}
                type="button"
                onClick={() => setSelectedSiteId(site.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: isSelected ? "2px solid #2563eb" : "1px solid #94a3b8",
                  background: isSelected ? "#2563eb" : "#e2e8f0",
                  color: isSelected ? "#fff" : "#1e293b",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: isSelected ? 600 : 500,
                  boxShadow: isSelected ? "0 1px 3px rgba(37, 99, 235, 0.3)" : "0 1px 2px rgba(0,0,0,0.06)",
                }}
              >
                {site.name || site.id}
              </button>
            );
          })}
        </div>
      </div>

      {/* Geographic analytics */}
      {analytics && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Total sites</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{analytics.totalSites}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>With coordinates</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{analytics.withCoordinates}</div>
          </div>
          {analytics.averageDistanceBetweenSitesKm != null && (
            <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Avg distance (km)</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{analytics.averageDistanceBetweenSitesKm}</div>
            </div>
          )}
          {analytics.maxDistanceBetweenAnyTwoKm != null && (
            <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--card-bg, rgba(255,255,255,0.02))" }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Max distance (km)</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{analytics.maxDistanceBetweenAnyTwoKm}</div>
            </div>
          )}
        </div>
      )}

      {/* Route optimization */}
      {sitesWithCoords.length >= 2 && (
        <div
          style={{
            padding: 16,
            marginBottom: 16,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--card-bg, rgba(255,255,255,0.02))",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Route optimization</div>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 12px 0" }}>
            Select sites to visit; we'll suggest an order that minimizes total travel distance.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {sitesWithCoords.map((site) => (
              <label key={site.id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectedSiteIds.has(siteIdStr(site.id))}
                  onChange={() => toggleSiteSelection(site.id)}
                />
                <span>{site.name || site.id}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleOptimizeRoute();
              }}
              disabled={routeLoading || selectedSiteIds.size < 2}
              aria-busy={routeLoading}
              title={selectedSiteIds.size < 2 ? "Select at least 2 sites to optimize a route" : "Optimize visit order for selected sites"}
              style={routeLoading || selectedSiteIds.size < 2 ? { cursor: "default" } : undefined}
            >
              {routeLoading ? "Optimizing…" : "Optimize route"}
            </button>
            {routeResult && (
              <button type="button" className="btn" onClick={clearRoute} style={{ opacity: 0.9 }}>
                Clear route
              </button>
            )}
          </div>
          {selectedSiteIds.size < 2 && (
            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>
              Select at least 2 sites above to optimize a route.
            </div>
          )}
          {routeError && <div style={{ marginTop: 8, color: "#dc2626", fontSize: 14 }}>{routeError}</div>}
          {routeResult && routeResult.orderedSites?.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 14 }}>
              <strong>Visit order:</strong>{" "}
              {routeResult.orderedSites.map((s, i) => `${i + 1}. ${s.name || s.id}`).join(" → ")}
              {routeResult.totalDistanceKm != null && (
                <span style={{ color: "var(--muted)", marginLeft: 8 }}>
                  (total {routeResult.totalDistanceKm} km)
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {showAddForm && (
        <form
          onSubmit={handleAddSite}
          style={{
            padding: 16,
            marginBottom: 16,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--card-bg, rgba(255,255,255,0.02))",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            maxWidth: 560,
          }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Name *</label>
            <input
              type="text"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Main Office"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8 }}
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Address</label>
            <input
              type="text"
              value={addForm.address}
              onChange={(e) => setAddForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Street, City, State"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8 }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Latitude</label>
            <input
              type="text"
              value={addForm.latitude}
              onChange={(e) => setAddForm((f) => ({ ...f, latitude: e.target.value }))}
              placeholder="e.g. 40.7128"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8 }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Longitude</label>
            <input
              type="text"
              value={addForm.longitude}
              onChange={(e) => setAddForm((f) => ({ ...f, longitude: e.target.value }))}
              placeholder="e.g. -74.006"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8 }}
            />
          </div>
          {addError && (
            <div style={{ gridColumn: "1 / -1", color: "#dc2626", fontSize: 14 }}>{addError}</div>
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="btn" disabled={adding}>
              {adding ? "Adding…" : "Add site"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <div className="notice" style={{ marginBottom: 16, background: is404 ? "#fef3c7" : undefined }}>
          {is404 ? geographicUnavailableMessage : `Failed to load sites: ${error?.message || "Unknown error"}`}
        </div>
      )}
      {!scriptLoaded && (
        <div style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
          Loading map…
        </div>
      )}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div
          ref={mapRef}
          style={{
            flex: "1 1 480px",
            minWidth: 0,
            height: "calc(100vh - 320px)",
            minHeight: 400,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid var(--border)",
            display: scriptLoaded ? "block" : "none",
          }}
        />
        {selectedSiteId && (
          <div
            style={{
              width: 360,
              maxWidth: "100%",
              padding: 16,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--card-bg, rgba(255,255,255,0.02))",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <strong style={{ fontSize: 16 }}>{sites.find((s) => s.id === selectedSiteId)?.name || "Site details"}</strong>
              <button
                type="button"
                onClick={() => setSelectedSiteId(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, opacity: 0.7 }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {siteDetailsLoading && <p style={{ color: "var(--muted)", margin: 0 }}>Loading…</p>}
            {siteDetailsError && (
              <p style={{ color: "#dc2626", margin: 0 }}>
                {siteDetailsError?.response?.status === 404
                  ? (siteDetailsError?.response?.data?.message || "Site not found or you don't have access.")
                  : (siteDetailsError?.response?.data?.message || siteDetailsError?.message || "Failed to load details.")}
              </p>
            )}
            {siteDetails && !siteDetailsLoading && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{siteDetails.siteName}</div>
                  {siteDetails.address && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{siteDetails.address}</div>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", fontSize: 14, marginBottom: 12 }}>
                  <span style={{ color: "var(--muted)" }}>Staff</span>
                  <span>{siteDetails.staffCount}</span>
                  <span style={{ color: "var(--muted)" }}>Supervisor</span>
                  <span>{siteDetails.supervisorName ?? "—"}</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Guards</div>
                {siteDetails.guards && siteDetails.guards.length > 0 ? (
                  <table className="table" style={{ width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteDetails.guards.map((g) => (
                        <tr key={g.id}>
                          <td>{g.name}</td>
                          <td>{g.email}</td>
                          <td>{g.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>No guards with shifts at this location yet.</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {scriptLoaded && !isLoading && (
        <div style={{ marginTop: 12, fontSize: 14, color: "var(--muted)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>{sites.length} site(s) total · {sitesWithCoords.length} with coordinates on map</span>
          {sites.length === 0 && !error && (
            <>
              <span>— No sites yet.</span>
              <button type="button" className="btn" onClick={() => refetch()} style={{ fontSize: 13 }}>
                Retry
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
