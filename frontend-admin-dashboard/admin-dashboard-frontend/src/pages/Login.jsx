import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Admin Login FORM ONLY (no page wrapper!)
 * Handles optional MFA: if login returns requiresMfa, shows code input and calls verify-login.
 */
const API_URL =
  process.env.REACT_APP_ADMIN_API_URL || "http://localhost:5000/api/admin";

const isProduction = typeof window !== "undefined" && window.location?.hostname !== "localhost" && window.location?.hostname !== "127.0.0.1";
const isLocalhostApi = !API_URL || /localhost|127\.0\.0\.1/.test(API_URL);
const showProductionApiWarning = isProduction && isLocalhostApi;

export default function Login() {
  const nav = useNavigate();

  const [email, setEmail] = useState("admin@test.com");
  const [password, setPassword] = useState("password123");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChannel, setMfaChannel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (mfaToken) {
      // Step 2: verify MFA code
      if (!mfaCode.trim()) {
        setError("Enter the verification code we sent you.");
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/mfa/verify-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mfaToken, code: mfaCode.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.message || "Invalid or expired code. Please sign in again.");
          setLoading(false);
          return;
        }
        const token = data?.token;
        const user = data?.admin || data?.user || null;
        if (!token) {
          setError("Verification response missing token.");
          setLoading(false);
          return;
        }
        localStorage.setItem("adminToken", token);
        if (user) {
          localStorage.setItem("adminUser", JSON.stringify(user));
          localStorage.setItem("adminInfo", JSON.stringify(user));
        }
        nav("/", { replace: true });
      } catch (err) {
        setError(err?.message || "Network error");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || "Login failed");
        setLoading(false);
        return;
      }

      if (data.requiresMfa && data.mfaToken) {
        setMfaToken(data.mfaToken);
        setMfaChannel(data.channel || "email");
        setMfaCode("");
        setError("");
        setLoading(false);
        return;
      }

      const token = data?.token;
      const user = data?.user || data?.admin || null;

      if (!token) {
        setError("Login response missing token.");
        setLoading(false);
        return;
      }

      localStorage.setItem("adminToken", token);
      if (user) {
        localStorage.setItem("adminUser", JSON.stringify(user));
        localStorage.setItem("adminInfo", JSON.stringify(user));
      }

      nav("/", { replace: true });
    } catch (err) {
      setError(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const backToEmailPassword = () => {
    setMfaToken("");
    setMfaCode("");
    setMfaChannel("");
    setError("");
  };

  return (
    <form className="loginForm" onSubmit={onSubmit}>
      {showProductionApiWarning ? (
        <div className="loginAlert" role="alert" style={{ marginBottom: 16, background: "rgba(220, 80, 60, 0.15)", border: "1px solid rgba(220,80,60,0.5)" }}>
          <div className="loginAlertText">
            <strong>Production API not configured</strong>
            <span style={{ display: "block", marginTop: 8, fontSize: 13 }}>
              Step 1: Get your backend URLs (e.g. from Railway/Render).<br />
              Step 2: In Vercel → this project → Settings → Environment Variables, set REACT_APP_API_URL, REACT_APP_ADMIN_API_URL, REACT_APP_GUARD_AI_URL to those URLs.<br />
              Step 3: Redeploy (Deployments → … → Redeploy). See VERCEL_DEPLOY.md for details.
            </span>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="loginAlert" role="alert">
          <div className="loginAlertDot" />
          <div className="loginAlertText">
            <strong>{mfaToken ? "Verification error" : "Login error"}</strong>
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {mfaToken ? (
        <>
          <p style={{ marginBottom: 12, color: "rgba(255,255,255,0.85)", fontSize: 14 }}>
            We sent a 6-digit code to your {mfaChannel === "sms" ? "phone" : "email"}. Enter it below.
          </p>
          <div className="field">
            <label className="label" htmlFor="mfaCode">
              Verification code
            </label>
            <input
              id="mfaCode"
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              disabled={loading}
              placeholder="000000"
              maxLength={6}
            />
          </div>
          <button className="btnPrimaryFull" type="submit" disabled={loading}>
            {loading ? "Verifying…" : "Verify and sign in"}
          </button>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 8, width: "100%" }}
            onClick={backToEmailPassword}
            disabled={loading}
          >
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="admin@test.com"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              placeholder="password123"
            />
          </div>

          <button className="btnPrimaryFull" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="loginFooter">
            <div className="hint">
              Admin: <code>admin@test.com</code> / <code>password123</code>
              <br />
              Supervisor: <code>supervisor@test.com</code> / <code>password123</code>
            </div>
          </div>
        </>
      )}
    </form>
  );
}
