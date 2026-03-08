import React, { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/**
 * Admin Login FORM ONLY (no page wrapper!)
 * Handles optional MFA: if login returns requiresMfa, shows code input and calls verify-login.
 * Runtime override: ?api=https://your-backend.up.railway.app (saved to localStorage so no redeploy needed).
 */
const BUILD_API_URL = (process.env.REACT_APP_ADMIN_API_URL || "http://localhost:5000/api/admin").replace(/[\/?]+$/, "");

const STORAGE_KEY = "adminApiUrl";
const DEFAULT_RUNTIME_API = "https://admin-dashboard-production-2596.up.railway.app/api/admin";

function getRuntimeApi() {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("api");
  if (q && q.trim()) {
    let u = q.trim().replace(/[\/?]+$/, "");
    if (u && !u.endsWith("/api/admin")) u = u + "/api/admin";
    try {
      localStorage.setItem(STORAGE_KEY, u);
      return u;
    } catch (_) {}
    return u;
  }
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (_) {}
  return null;
}

export default function Login() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [runtimeApi, setRuntimeApi] = useState(getRuntimeApi);

  useEffect(() => {
    fetch("/api-config.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const url = data?.adminApiUrl || (data?.apiBase ? data.apiBase.replace(/[\/?]+$/, "") + "/api/admin" : null);
        if (url && url.replace(/[\/?]+$/, "")) {
          try {
            localStorage.setItem(STORAGE_KEY, url);
            setRuntimeApi(url);
          } catch (_) {}
        }
      })
      .catch(() => {});
  }, []);

  const effectiveApiUrl = useMemo(() => {
    const r = runtimeApi && runtimeApi.trim().replace(/[\/?]+$/, "");
    if (r) return r.endsWith("/api/admin") ? r : r + "/api/admin";
    return BUILD_API_URL;
  }, [runtimeApi]);

  const isProduction = typeof window !== "undefined" && window.location?.hostname !== "localhost" && window.location?.hostname !== "127.0.0.1";
  const isLocalhostApi = !effectiveApiUrl || /localhost|127\.0\.0\.1/.test(effectiveApiUrl);
  const showProductionApiWarning = isProduction && isLocalhostApi;
  const blockLoginInProductionNoApi = showProductionApiWarning;

  const [email, setEmail] = useState("admin@test.com");
  const [password, setPassword] = useState("password123");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaChannel, setMfaChannel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    blockLoginInProductionNoApi
      ? "App is calling localhost. Use the link below to point to your backend (no redeploy needed), or set env vars in Vercel and redeploy."
      : ""
  );

  const applyDefaultBackend = () => {
    try {
      localStorage.setItem(STORAGE_KEY, DEFAULT_RUNTIME_API);
      setRuntimeApi(DEFAULT_RUNTIME_API);
      setError("");
      setSearchParams({});
    } catch (_) {}
  };

  const clearBackendOverride = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setRuntimeApi(null);
      setSearchParams({});
      setError("Cleared. Reload to use build default.");
    } catch (_) {}
  };

  const getApiBaseForRequest = () => {
    try {
      const s = localStorage.getItem("adminApiUrl");
      if (s && s.trim()) {
        let u = s.trim().replace(/[\/?]+$/, "");
        return u.endsWith("/api/admin") ? u : u + "/api/admin";
      }
    } catch (_) {}
    return effectiveApiUrl;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const apiBase = getApiBaseForRequest();
    if (blockLoginInProductionNoApi && !apiBase.includes("railway.app")) {
      setError("Click \"Use Railway backend\" below to fix without redeploying, or set REACT_APP_ADMIN_API_URL in Vercel and redeploy.");
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
        const res = await fetch(`${apiBase}/mfa/verify-login`, {
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
      const loginUrl = `${apiBase}/login`;
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
      <div style={{ marginBottom: 12, fontSize: 11, color: "rgba(255,255,255,0.7)", wordBreak: "break-all" }}>
        API (build): <code>{BUILD_API_URL}</code> {runtimeApi ? " → override: " + effectiveApiUrl : ""}
      </div>
      {showProductionApiWarning ? (
        <div className="loginAlert" role="alert" style={{ marginBottom: 16, background: "rgba(220, 80, 60, 0.2)", border: "1px solid rgba(220,80,60,0.6)", padding: 16 }}>
          <div className="loginAlertText">
            <strong>Fix “access control” / CORS (no redeploy needed)</strong>
            <span style={{ display: "block", marginTop: 8, fontSize: 13 }}>
              This build is calling: <code style={{ wordBreak: "break-all" }}>{effectiveApiUrl}</code>
            </span>
            <span style={{ display: "block", marginTop: 12, fontSize: 13 }}>Click below to use your Railway backend for this browser:</span>
            <button type="button" onClick={applyDefaultBackend} style={{ marginTop: 8, padding: "8px 14px", background: "#0a0", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
              Use Railway backend
            </button>
            <span style={{ display: "block", marginTop: 8, fontSize: 12, opacity: 0.9 }}>Or add the same URL as <code>?api=</code>: <code style={{ wordBreak: "break-all" }}>?api=https://admin-dashboard-production-2596.up.railway.app</code></span>
          </div>
        </div>
      ) : null}
      {effectiveApiUrl && !isLocalhostApi ? (
        <div style={{ marginBottom: 12, fontSize: 12, opacity: 0.85 }}>
          Backend: <code style={{ wordBreak: "break-all" }}>{effectiveApiUrl}</code>{" "}
          <button type="button" onClick={clearBackendOverride} style={{ marginLeft: 8, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>Clear</button>
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
