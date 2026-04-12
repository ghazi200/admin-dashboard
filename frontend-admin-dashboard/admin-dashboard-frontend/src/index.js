import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles.css";

// BUILD MARKER — if you see this in console, new bundle is loaded (socket uses Railway in production)
const APP_BUILD_ID = "2026-04-11-map-add-site-orange-btn";
if (typeof console !== "undefined") {
  console.log("%c BUILD " + APP_BUILD_ID, "color: #f97316; font-weight: bold; font-size: 14px;");
}
if (typeof window !== "undefined") {
  window.__APP_BUILD_ID__ = APP_BUILD_ID;
  window.__ORANGE_THEME_BUILD__ = true;
}

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
