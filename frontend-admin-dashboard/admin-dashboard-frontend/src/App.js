/**
 * ADMIN DASHBOARD FRONTEND
 * ------------------------------------
 * Runs on: http://localhost:3000
 *
 * Responsibilities:
 * - Client-side routing (React Router)
 * - Protected routes via <ProtectedRoute />
 * - Layout wrapper for authenticated pages
 *
 * Pages:
 * - /login        → Login page
 * - /             → Dashboard
 * - /guards       → Guard management
 * - /shifts       → Shift management
 * - /users        → Admin users & permissions
 *
 * API:
 * - All API calls go through axiosClient
 * - axiosClient proxies to ADMIN BACKEND (port 5000)
 *
 * This file should NEVER:
 * - Contain API logic
 * - Contain auth token parsing
 * - Know backend ports directly
 */
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import AuthLayout from "./components/AuthLayout";
import ErrorBoundary from "./components/ErrorBoundary";

import { NotificationsProvider } from "./context/NotificationContext";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Guards from "./pages/Guards";
import Shifts from "./pages/Shifts";
import Users from "./pages/Users";
import AIRanking from "./pages/AIRanking";
import PolicyAssistant from "./pages/PolicyAssistant";
import Schedule from "./pages/Schedule";
import Payroll from "./pages/Payroll";
import SupervisorAssistant from "./pages/SupervisorAssistant";
import GuardReputation from "./pages/GuardReputation";
import Incidents from "./pages/Incidents";
import Inspections from "./pages/Inspections";
import CommandCenter from "./pages/CommandCenter";
import Analytics from "./pages/Analytics";
import CalloutRisk from "./pages/CalloutRisk";
import ReportBuilder from "./pages/ReportBuilder";
import SuperAdmin from "./pages/SuperAdmin";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import EmailSchedulerSettings from "./pages/EmailSchedulerSettings";
import AccountSecurity from "./pages/AccountSecurity";
import ScheduleGeneration from "./pages/ScheduleGeneration";
import FairnessRebalancing from "./pages/FairnessRebalancing";
import ShiftSwaps from "./pages/ShiftSwaps";
import Announcements from "./pages/Announcements";
import Messages from "./pages/Messages";
import MessagesGuard from "./pages/MessagesGuard";
import GeographicDashboard from "./pages/GeographicDashboard";
import OwnerDashboard from "./pages/OwnerDashboard";
import Staff from "./pages/Staff";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ✅ PUBLIC LOGIN (NO NotificationsProvider here) */}
        <Route
          path="/login"
          element={
            <AuthLayout
              leftKicker="ABE"
              leftTitle="Admin Command Center Powered By AI Agent 24"
              leftSubtitle="Manage guards, shifts, and coverage issues in one place. Secure JWT auth with Admin API."
              badges={["Auth: JWT", "Ops: Live Callouts", "CRUD: Guards/Shifts"]}
              formTitle="Sign in"
              formSubtitle="Use your credentials"
            >
              <Login />
            </AuthLayout>
          }
        />

        {/* ✅ PROTECTED APP (NotificationsProvider ONLY after token exists) */}
        <Route
          element={
            <ProtectedRoute>
              <NotificationsProvider>
                <Layout />
              </NotificationsProvider>
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/guards" element={<Guards />} />
          <Route path="/shifts" element={<Shifts />} />
          <Route path="/users" element={<Users />} />
          <Route path="/ai-ranking" element={<AIRanking />} />
          <Route path="/policy" element={<PolicyAssistant />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/supervisor" element={<SupervisorAssistant />} />
          <Route path="/reputation" element={<GuardReputation />} />
          <Route path="/incidents" element={<ErrorBoundary><Incidents /></ErrorBoundary>} />
          <Route path="/inspections" element={<ErrorBoundary><Inspections /></ErrorBoundary>} />
          <Route path="/command-center" element={<CommandCenter />} />
          <Route path="/map" element={<GeographicDashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/callout-risk" element={<CalloutRisk />} />
          <Route path="/reports" element={<ErrorBoundary><ReportBuilder /></ErrorBoundary>} />
          <Route path="/email-scheduler-settings" element={<EmailSchedulerSettings />} />
          <Route path="/account" element={<AccountSecurity />} />
          <Route path="/schedule-generation" element={<ScheduleGeneration />} />
          <Route path="/fairness-rebalancing" element={<FairnessRebalancing />} />
          <Route path="/shift-swaps" element={<ShiftSwaps />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/guard" element={<MessagesGuard />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/super-admin" element={<SuperAdminDashboard />} />
          <Route path="/super-admin/manage" element={<SuperAdmin />} />
        </Route>

        {/* fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
