import React from "react";
import ProtectedRoute from "../auth/ProtectedRoute";
import ErrorBoundary from "./ErrorBoundary";
import IncidentReport from "../pages/IncidentReport";

/**
 * Separate route component to ensure React Router recognizes it
 */
export default function IncidentRoute() {
  return (
    <ProtectedRoute>
      <ErrorBoundary>
        <IncidentReport />
      </ErrorBoundary>
    </ProtectedRoute>
  );
}
