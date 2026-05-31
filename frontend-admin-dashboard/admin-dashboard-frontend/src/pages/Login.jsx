import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { connectSocket } from "../realtime/socket";
import "./Login.css";

/**
 * Admin Login FORM ONLY (no page wrapper!)
 * No localhost in bundle — use REACT_APP_API_URL or REACT_APP_ADMIN_API_URL. Local dev: set to http://localhost:5000
 */
const RAILWAY_API = "https://admin-dashboard-production-2596.up.railway.app/api/admin";

function isProductionHost() {
  if (typeof window === "undefined" || !window.location?.hostname) return false;
  const h = window.location.hostname.toLowerCase();
  return h !== "localhost" && h !== "127.0.0.1";
}

function getLoginApiUrl() {
  const envUrl = (process.env.REACT_APP_API_URL || process.env.REACT_APP_ADMIN_API_URL || "").replace(/\/+$/, "");
  let base = envUrl ? (envUrl.includes("/api") ? envUrl : envUrl + "/api/admin") : RAILWAY_API;
  if (isProductionHost() && /localhost|127\.0\.0\.1/.test(base)) base = RAILWAY_API;
  return base;
}

/** Never send login to empty or relative URL; never use localhost when on production host. */
function ensureLoginBase(base) {
  if (base && base.startsWith("http")) {
    const b = base.replace(/\/+$/, "");
    if (isProductionHost() && /localhost|127\.0\.0\.1/.test(b)) return RAILWAY_API;
    return b;
  }
  return RAILWAY_API;
}

const showProductionApiWarning = false;

export default function Login() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
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
        const res = await fetch(`${ensureLoginBase(getLoginApiUrl())}/mfa/verify-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mfaToken, code: mfaCode.trim() }),
          credentials: "include",
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
        connectSocket();
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
      const loginUrl = `${ensureLoginBase(getLoginApiUrl())}/login`;
      const res = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.message || "Login failed");
        setLoading(false);
        return;
      }

      if (data.requiresMfa && data.mfaToken) {
        setMfaToken(data.mfaToken);
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

      connectSocket();
      nav("/", { replace: true });
    } catch (err) {
      setError(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
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
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {mfaToken ? (
        <>
          <div className="field">
            <label className="label" htmlFor="mfaCode">
              Code
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
            {loading ? "Signing in…" : "Sign in"}
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
            />
          </div>

          <button className="btnPrimaryFull" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </>
      )}
    </form>
  );
}
