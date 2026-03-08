import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Admin Login FORM ONLY (no page wrapper!)
 * Handles optional MFA: if login returns requiresMfa, shows code input and calls verify-login.
 */
const API_URL = (process.env.REACT_APP_ADMIN_API_URL || "http://localhost:5000/api/admin").replace(/[\/?]+$/, "");

const isProduction = typeof window !== "undefined" && window.location?.hostname !== "localhost" && window.location?.hostname !== "127.0.0.1";
const isLocalhostApi = !API_URL || /localhost|127\.0\.0\.1/.test(API_URL);
const showProductionApiWarning = isProduction && isLocalhostApi;
/** When true, login will fail with CORS; block submit and show config steps */
const blockLoginInProductionNoApi = showProductionApiWarning;

export default function Login() {
  const nav = useNavigate();

  const [email, setEmail] = useState("admin@test.com");
  const [password, setPassword] = useState("password123");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChannel, setMfaChannel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    blockLoginInProductionNoApi
      ? "App is calling localhost (wrong). In Vercel set REACT_APP_API_URL and REACT_APP_ADMIN_API_URL to https://admin-dashboard-production-2596.up.railway.app (and .../api/admin), then redeploy."
      : ""
  );

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (blockLoginInProductionNoApi) {
      setError("Set REACT_APP_API_URL and REACT_APP_ADMIN_API_URL in Vercel (Environment Variables), then redeploy. See the red notice above.");
      return;
    }

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
      const loginUrl = `${API_URL}/login`;
      const res = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.message || "Login failed";
        const hint = (res.status === 401 || /invalid|password|credentials/i.test(msg))
          ? " Test accounts need seeding first: POST your-backend/api/dev/seed-admin (see LOGIN_CREDENTIALS.md)."
          : "";
        setError(msg + hint);
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
      const raw = err?.message || "Network error";
      const isCorsOrNetwork = /fetch|network|access control|cors|failed to load/i.test(raw) || !raw;
      const friendly = isCorsOrNetwork
        ? "Request blocked (CORS/network). Set REACT_APP_API_URL and REACT_APP_ADMIN_API_URL in Vercel to your backend URL (e.g. https://admin-dashboard-production-2596.up.railway.app), then redeploy. Ensure backend CORS_ORIGINS includes your Vercel URL."
        : raw;
      setError(friendly);
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
        <div className="loginAlert" role="alert" style={{ marginBottom: 16, background: "rgba(220, 80, 60, 0.2)", border: "1px solid rgba(220,80,60,0.6)", padding: 16 }}>
          <div className="loginAlertText">
            <strong>Fix “access control” / CORS: set backend URL in Vercel</strong>
            <span style={{ display: "block", marginTop: 8, fontSize: 13 }}>
              This build is calling: <code style={{ wordBreak: "break-all" }}>{API_URL || "http://localhost:5000/api/admin"}</code>
            </span>
            <span style={{ display: "block", marginTop: 8, fontSize: 13 }}>
              In Vercel → Project → Settings → Environment Variables add (then redeploy):
            </span>
            <ul style={{ margin: "8px 0 0 0", paddingLeft: 20, fontSize: 13 }}>
              <li><code>REACT_APP_API_URL</code> = <code>https://admin-dashboard-production-2596.up.railway.app</code></li>
              <li><code>REACT_APP_ADMIN_API_URL</code> = <code>https://admin-dashboard-production-2596.up.railway.app/api/admin</code></li>
            </ul>
            <span style={{ display: "block", marginTop: 8, fontSize: 12, opacity: 0.9 }}>Then push this repo, or Deployments → Redeploy. New message appears after you deploy.</span>
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
          <button className="btnPrimaryFull" type="submit" disabled={loading || blockLoginInProductionNoApi}>
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

          <button className="btnPrimaryFull" type="submit" disabled={loading || blockLoginInProductionNoApi}>
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <div className="loginFooter">
            <div className="hint">
              Test accounts (only work after seeding): Admin <code>admin@test.com</code> / <code>password123</code>, Supervisor <code>supervisor@test.com</code> / <code>password123</code>. Seed once: POST your-backend/api/dev/seed-admin (see LOGIN_CREDENTIALS.md).
            </div>
          </div>
        </>
      )}
    </form>
  );
}
