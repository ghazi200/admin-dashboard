import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles.css";

// BUILD MARKER — if you see this in console, new bundle is loaded (socket uses Railway in production)
const APP_BUILD_ID = "2025-02-06-railway-v2";
if (typeof console !== "undefined") {
  console.log("%c BUILD " + APP_BUILD_ID, "color: green; font-weight: bold; font-size: 14px;");
}
if (typeof window !== "undefined") window.__APP_BUILD_ID__ = APP_BUILD_ID;

// ✅ Create Query Client ONCE
const queryClient = new QueryClient();

// ✅ Find root element
const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No #root element found in index.html");

// ✅ Render
createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
