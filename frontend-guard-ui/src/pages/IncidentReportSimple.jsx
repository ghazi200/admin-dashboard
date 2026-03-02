import React from "react";
import NavBar from "../components/NavBar";

/**
 * Simple test component to verify routing works
 * If this works, the issue is with the full IncidentReport component
 */
export default function IncidentReportSimple() {
  console.log("✅ IncidentReportSimple component rendering");
  
  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", width: "100%", display: "block" }}>
      <NavBar />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: 40, background: "#fff", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 16, color: "#1a1a1a" }}>
          ✅ Incident Report Simple Test
        </h1>
        <p style={{ fontSize: 16, color: "#666", marginBottom: 24 }}>
          If you see this, routing to /incident-simple is working!
        </p>
        <div style={{ padding: 20, background: "#e0f2fe", borderRadius: 8, border: "2px solid #0ea5e9" }}>
          <strong>✅ Component is rendering successfully</strong>
          <br />
          <span style={{ fontSize: 14, color: "#666" }}>
            This means routing works. The issue is with the full IncidentReport component.
          </span>
        </div>
      </div>
    </div>
  );
}
