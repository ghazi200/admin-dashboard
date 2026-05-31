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
import RequestTimeOff from "./pages/RequestTimeOff";
import Payroll from "./pages/Payroll";
import EmergencySOS from "./pages/EmergencySOS";
import Announcements from "./pages/Announcements";
import Dashboard from "./pages/Dashboard";
import "./styles/styles.css";
/* Login page styles must load after globals so agent header colors win the cascade */
import "./pages/Login.css";
import { isProductionBuild } from "./config/buildFlags";

export default function App() {
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
      <BrowserRouter>
        {/* SessionTimeout: add back <SessionTimeout /> here if you need idle logout (import from ./components/SessionTimeout) */}
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/incident" element={<IncidentRoute />} />

          {!isProductionBuild && (
            <>
              <Route path="/incident-direct" element={<IncidentReport />} />
              <Route path="/incident-test2" element={<div style={{ padding: 40, fontSize: 24 }}>Route test</div>} />
              <Route
                path="/shifts/swap-test"
                element={<div style={{ padding: 40, fontSize: 24, background: "#fff", minHeight: "100vh" }}>Route test</div>}
              />
              <Route
                path="/shifts/swap-test-protected"
                element={
                  <ProtectedRoute>
                    <div style={{ padding: 40, fontSize: 24, background: "#fff", minHeight: "100vh" }}>Route test</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/incident-test" element={<IncidentReport />} />
              <Route path="/incident-simple-test" element={<IncidentReportSimple />} />
            </>
          )}

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
          <Route
            path="/shifts/swap"
            element={
              <ProtectedRoute>
                <ShiftSwapMarketplace />
              </ProtectedRoute>
            }
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

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/request-time-off"
            element={
              <ProtectedRoute>
                <RequestTimeOff />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll"
            element={
              <ProtectedRoute>
                <Payroll />
              </ProtectedRoute>
            }
          />
          <Route
            path="/emergency"
            element={
              <ProtectedRoute>
                <EmergencySOS />
              </ProtectedRoute>
            }
          />
          <Route
            path="/announcements"
            element={
              <ProtectedRoute>
                <Announcements />
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

          {!isProductionBuild && (
            <Route
              path="/incident-simple"
              element={
                <ProtectedRoute>
                  <IncidentReportSimple />
                </ProtectedRoute>
              }
            />
          )}

          {/* Fallback - redirect unknown routes to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
