import React from "react";

/**
 * Error Boundary to catch component errors
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("❌ ErrorBoundary caught an error:", error);
    console.error("❌ Error info:", errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, maxWidth: 800, margin: "0 auto", minHeight: "100vh", background: "#0a0f1a", color: "#e2e8f0" }}>
          <h1 style={{ color: "#f87171", marginBottom: 16 }}>Something went wrong</h1>
          <p style={{ color: "#94a3b8", marginBottom: 16 }}>
            The Guard app hit an error. You can try reloading or go back to login to fix the server URL.
          </p>
          <pre style={{ 
            padding: 16, 
            background: "rgba(248,113,113,0.1)", 
            borderRadius: 8, 
            overflow: "auto",
            fontSize: 12,
            color: "#fca5a5",
          }}>
            {this.state.error?.toString()}
          </pre>
          <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <button
              onClick={() => (window.location.href = "/login")}
              style={{
                padding: "12px 24px",
                background: "#7c3aed",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Go to Login
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 24px",
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
