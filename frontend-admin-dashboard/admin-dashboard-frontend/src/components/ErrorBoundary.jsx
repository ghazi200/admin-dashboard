import React from "react";

/**
 * Catches JS errors in child component tree and shows a fallback so the page is not blank.
 */
export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container" style={{ padding: 24 }}>
          <h1 style={{ marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ marginBottom: 16, opacity: 0.8 }}>
            {this.state.error?.message || "This page could not be loaded."}
          </p>
          <button
            type="button"
            className="btn btnPrimary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
