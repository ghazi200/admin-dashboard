import React from "react";
import "../styles/auth.css";

export default function AuthLayout({
  // LEFT PANEL
  leftKicker = "ABE",
  leftTitle = "Admin Scheduling Console",
  leftSubtitle = "Manage guards, shifts, and coverage issues in one place. Secure JWT auth with backend on :5000.",
  badges = ["Auth: JWT", "Ops: Live Callouts", "CRUD: Guards/Shifts"],

  // RIGHT PANEL
  formTitle = "Sign in",
  formSubtitle = "Use your credentials",

  // CHILDREN (THE FORM)
  children,
}) {
  return (
    <div className="auth-page">
      <div className="auth-shell">
        {/* LEFT */}
        <div className="auth-panel auth-panel--left">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="brand-mark" />
            <div className="auth-kicker">{leftKicker}</div>
          </div>

          <h1 className="auth-left-title">{leftTitle}</h1>
          <p className="auth-left-subtitle">{leftSubtitle}</p>

          {/* AI AGENT 24 Animated Header (same as guard-ui) */}
          <div className="aiAgentHeader">
            <h1 className="aiAgentText">
              <span className="aiAgentLetter" style={{ animationDelay: '0s' }}>A</span>
              <span className="aiAgentLetter" style={{ animationDelay: '0.1s' }}>I</span>
              <span className="aiAgentSpace"> </span>
              <span className="aiAgentLetter" style={{ animationDelay: '0.2s' }}>A</span>
              <span className="aiAgentLetter" style={{ animationDelay: '0.3s' }}>G</span>
              <span className="aiAgentLetter" style={{ animationDelay: '0.4s' }}>E</span>
              <span className="aiAgentLetter" style={{ animationDelay: '0.5s' }}>N</span>
              <span className="aiAgentLetter" style={{ animationDelay: '0.6s' }}>T</span>
              <span className="aiAgentSpace"> </span>
              <span className="aiAgentLetter" style={{ animationDelay: '0.7s' }}>2</span>
              <span className="aiAgentLetter" style={{ animationDelay: '0.8s' }}>4</span>
            </h1>
          </div>

          <div className="auth-badges">
            {badges.map((b) => (
              <span className="badge" key={b}>
                <span className="badge-dot" />
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div className="auth-panel auth-panel--right">
          <h2 className="auth-form-title">{formTitle}</h2>
          <p className="auth-form-subtitle">{formSubtitle}</p>

          {/* ✅ MUST BE HERE */}
          <div style={{ marginTop: 14 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
