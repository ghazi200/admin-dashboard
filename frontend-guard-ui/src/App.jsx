import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";

import Login from "./pages/Login";
import Home from "./pages/Home";
import AskPolicy from "./pages/AskPolicy";
import Shifts from "./pages/Shifts";
import TimeClock from "./pages/TimeClock";
import Callouts from "./pages/Callouts";
import Schedule from "./pages/Schedule";
import IncidentReport from "./pages/IncidentReport";
import IncidentReportSimple from "./pages/IncidentReportSimple";
import ErrorBoundary from "./components/ErrorBoundary";
import IncidentRoute from "./components/IncidentRoute";
import ShiftSwapMarketplace from "./pages/ShiftSwapMarketplace";
import AvailabilityPreferences from "./pages/AvailabilityPreferences";
import ShiftHistory from "./pages/ShiftHistory";
import ShiftReportForm from "./pages/ShiftReportForm";
import Messages from "./pages/Messages";
import Account from "./pages/Account";

// Debug: Log that components are imported
console.log("[App.jsx] Shift Management components imported:", {
  ShiftSwapMarketplace: !!ShiftSwapMarketplace,
  AvailabilityPreferences: !!AvailabilityPreferences,
  ShiftHistory: !!ShiftHistory,
  ShiftReportForm: !!ShiftReportForm,
});

import "./styles/styles.css";

export default function App() {
  console.log("[App.jsx] App component rendering...");

  useEffect(() => {
    if (typeof window !== "undefined" && window.Capacitor) {
      document.documentElement.classList.add("guard-app-native");
    }
    return () => {
      document.documentElement.classList.remove("guard-app-native");
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true }}>
        <Routes>
          {/* Debug: Log all routes */}
          {(() => {
            console.log("[App.jsx] Routes being registered:");
            console.log("  - /shifts/swap-test");
            console.log("  - /shifts/swap-test-protected");
            console.log("  - /shifts/swap");
            console.log("  - /shifts/availability");
            console.log("  - /shifts/history");
            console.log("  - /shifts/:id/report");
            console.log("  - /shifts (general)");
            return null;
          })()}
          <Route path="/login" element={<Login />} />

          {/* Put /incident BEFORE / route to ensure it matches */}
          {/* Try direct component first */}
          <Route path="/incident-direct" element={<IncidentReport />} />
          <Route path="/incident" element={<IncidentRoute />} />
          <Route path="/incident-test2" element={<div style={{ padding: 40, fontSize: 24 }}>✅ Route /incident-test2 works!</div>} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ask-policy"
            element={
              <ProtectedRoute>
                <AskPolicy />
              </ProtectedRoute>
            }
          />

          {/* Shift Management Routes - MUST come before /shifts */}
          {/* Test route first - without ProtectedRoute */}
          <Route
            path="/shifts/swap-test"
            element={<div style={{ padding: 40, fontSize: 24, background: "#fff", minHeight: "100vh" }}>✅ Route /shifts/swap-test works!</div>}
          />
          {/* Test route with ProtectedRoute */}
          <Route
            path="/shifts/swap-test-protected"
            element={
              <ProtectedRoute>
                <div style={{ padding: 40, fontSize: 24, background: "#fff", minHeight: "100vh" }}>✅ Protected route works!</div>
              </ProtectedRoute>
            }
          />
          {/* Main shift swap route - try without ProtectedRoute first to test */}
          <Route
            path="/shifts/swap"
            element={<ShiftSwapMarketplace />}
          />
          <Route
            path="/shifts/availability"
            element={
              <ProtectedRoute>
                <AvailabilityPreferences />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shifts/history"
            element={
              <ProtectedRoute>
                <ShiftHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shifts/:id/report"
            element={
              <ProtectedRoute>
                <ShiftReportForm />
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/shifts"
            element={
              <ProtectedRoute>
                <Shifts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/timeclock"
            element={
              <ProtectedRoute>
                <TimeClock />
              </ProtectedRoute>
            }
          />

          <Route
            path="/callouts"
            element={
              <ProtectedRoute>
                <Callouts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/schedule"
            element={
              <ProtectedRoute>
                <Schedule />
              </ProtectedRoute>
            }
          />

          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <Messages />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            }
          />

          {/* Incident Report Routes - /incident is defined above before / */}
          <Route
            path="/incidents"
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <IncidentReport />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          
          {/* Temporary: Direct route without ProtectedRoute for testing */}
          <Route
            path="/incident-test"
            element={<IncidentReport />}
          />
          
          {/* Simple test component to verify routing works */}
          <Route
            path="/incident-simple"
            element={
              <ProtectedRoute>
                <IncidentReportSimple />
              </ProtectedRoute>
            }
          />
          
          {/* Simple test without auth */}
          <Route
            path="/incident-simple-test"
            element={<IncidentReportSimple />}
          />

          {/* Fallback - redirect unknown routes to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
