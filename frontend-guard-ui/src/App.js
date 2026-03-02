
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";

import Login from "./pages/Login";
import Home from "./pages/Home";
import AskPolicy from "./pages/AskPolicy";
import Shifts from "./pages/Shifts";
import TimeClock from "./pages/TimeClock";
import Callouts from "./pages/Callouts";
import Schedule from "./pages/Schedule";
import RequestTimeOff from "./pages/RequestTimeOff";
import Payroll from "./pages/Payroll";
import IncidentReport from "./pages/IncidentReport";
import ShiftSwapMarketplace from "./pages/ShiftSwapMarketplace";
import AvailabilityPreferences from "./pages/AvailabilityPreferences";
import ShiftHistory from "./pages/ShiftHistory";
import ShiftReportForm from "./pages/ShiftReportForm";
import EmergencySOS from "./pages/EmergencySOS";
import Announcements from "./pages/Announcements";
import Dashboard from "./pages/Dashboard";
import Messages from "./pages/Messages";
import Account from "./pages/Account";
import SessionTimeout from "./components/SessionTimeout";

import "./styles/styles.css";


export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <SessionTimeout />
        <Routes>
          <Route path="/login" element={<Login />} />

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
                <Messages />
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
            path="/incident"
            element={
              <ProtectedRoute>
                <IncidentReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/incidents"
            element={
              <ProtectedRoute>
                <IncidentReport />
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
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
