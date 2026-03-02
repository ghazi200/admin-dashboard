import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./styles.css";

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
