import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = "<p style=\"padding:16px;font-family:sans-serif\">Guard UI: missing #root in index.html</p>";
} else {
  try {
    const root = ReactDOM.createRoot(rootEl);
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    );
  } catch (e) {
    console.error(e);
    rootEl.innerHTML = `<p style="padding:16px;font-family:sans-serif">Guard UI failed to start: ${String(e?.message || e)}</p>`;
  }
}
