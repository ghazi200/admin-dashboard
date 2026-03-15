/**
 * Reusable Google Map showing site markers.
 * Requires REACT_APP_GOOGLE_MAPS_API_KEY. Pass sites with id, name, address?, latitude, longitude.
 */
import React, { useEffect, useRef, useState } from "react";

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };
const DEFAULT_ZOOM = 10;

export default function SitesMap({ sites = [], style = {}, height = 400 }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [mapError, setMapError] = useState("");

  const sitesWithCoords = Array.isArray(sites)
    ? sites.filter((s) => s.latitude != null && s.longitude != null)
    : [];

  useEffect(() => {
    const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    if (!key) {
      setMapError("REACT_APP_GOOGLE_MAPS_API_KEY is not set");
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

  useEffect(() => {
    if (!scriptLoaded || !window.google?.maps || !mapRef.current || mapInstanceRef.current) return;
    const map = new window.google.maps.Map(mapRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
    });
    mapInstanceRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      mapInstanceRef.current = null;
    };
  }, [scriptLoaded]);

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

  if (mapError) {
    return (
      <div style={{ padding: 16, background: "#fef2f2", color: "#b91c1c", borderRadius: 8, ...style }}>
        {mapError}. Add REACT_APP_GOOGLE_MAPS_API_KEY to .env and restart.
      </div>
    );
  }

  const containerStyle = {
    width: "100%",
    height: typeof height === "number" ? `${height}px` : height,
    minHeight: 280,
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid var(--border, #e2e8f0)",
    ...style,
  };

  return (
    <>
      {!scriptLoaded && (
        <div style={{ ...containerStyle, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
          Loading map…
        </div>
      )}
      <div
        ref={mapRef}
        style={{
          ...containerStyle,
          display: scriptLoaded ? "block" : "none",
        }}
      />
    </>
  );
}
