// src/pages/Login.jsx
import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { loginGuard } from "../services/guardApi";
import {
  getGuardApiUrl,
  setGuardApiUrl,
  getAdminApiUrl,
  setAdminApiUrl,
  isAndroidApp,
  EMULATOR_GUARD_URL,
  isLanIpUrl,
} from "../config/apiUrls";
import "./Login.css";

const WHY_CHANGE_LOCATION =
  "Each Wi‑Fi network gives your computer a different IP address. The app remembers the last Server URL (your old IP). After changing location, that saved IP is no longer your computer, so the app can't connect. Reset URLs below, then set Server URL to this computer's current IP (or use emulator URL on emulator).";

export default function Login() {
  const { loginWithToken } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [devToken, setDevToken] = useState("");
  const [err, setErr] = useState("");

  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null); // "checking" | "ok" | "fail"
  const [serverUrl, setServerUrl] = useState(() => getGuardApiUrl());
  const [adminApiUrl, setAdminApiUrlState] = useState(() => getAdminApiUrl());
  const [adminConnectionStatus, setAdminConnectionStatus] = useState(null);
  const [showStaleUrlHint, setShowStaleUrlHint] = useState(false);

  // Sync displayed URLs with effective API URLs (e.g. after Android overrides)
  useEffect(() => {
    const guardUrl = getGuardApiUrl();
    const adminUrl = getAdminApiUrl();
    setServerUrl(guardUrl);
    setAdminApiUrlState(adminUrl);
    if (isLanIpUrl(guardUrl)) setShowStaleUrlHint(true);
  }, []);

  // ✅ When user just logged out, clear the flag only (don't auto-login)
  useEffect(() => {
    if (localStorage.getItem("guardJustLoggedOut") === "1") {
      localStorage.removeItem("guardJustLoggedOut");
    }
  }, []);

  // ✅ Pre-fill dev token from storage so user can click "Use Dev Token" or type email/password
  useEffect(() => {
    const saved =
      localStorage.getItem("guardDevToken") ||
      localStorage.getItem("guardToken") ||
      "";
    const t = String(saved).trim();
    if (t) setDevToken(t);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);

    try {
      // ✅ Dev token mode (paste JWT)
      if (devToken.trim()) {
        const t = devToken.trim();

        // Save both: dev convenience + real runtime token
        localStorage.setItem("guardDevToken", t);
        localStorage.setItem("guardToken", t);

        loginWithToken(t);
        window.location.href = "/";
        return;
      }

      const em = email.trim();
      const pw = password;

      const res = await loginGuard(em, pw);
      const token = res?.data?.token;

      if (!token) throw new Error("No token returned");

      // ✅ Always store the real guard token key
      localStorage.setItem("guardToken", token);

      loginWithToken(token, res?.data?.user || null);
      window.location.href = "/";
    } catch (e2) {
      console.error("Login error:", e2);
      const isNetworkError =
        e2?.code === "ECONNREFUSED" ||
        e2?.code === "ERR_NETWORK" ||
        (e2?.message && e2.message.includes("Network Error"));
      const isTimeout =
        e2?.code === "ECONNABORTED" || (e2?.message && e2.message.includes("timeout"));

      // On Android: if connection failed or timed out and current URL is a LAN IP (stale after move), try emulator URL once
      if (
        (isNetworkError || isTimeout) &&
        isAndroidApp() &&
        getGuardApiUrl() !== EMULATOR_GUARD_URL &&
        isLanIpUrl(getGuardApiUrl())
      ) {
        setGuardApiUrl(EMULATOR_GUARD_URL);
        setServerUrl(EMULATOR_GUARD_URL);
        try {
          const retryRes = await loginGuard(email.trim(), password);
          const retryToken = retryRes?.data?.token;
          if (retryToken) {
            localStorage.setItem("guardToken", retryToken);
            loginWithToken(retryToken, retryRes?.data?.user || null);
            window.location.href = "/";
            return;
          }
        } catch (_) {
          // Fall through to show error below
        }
      }

      const msg = e2?.response?.data?.message || e2?.response?.data?.error || e2?.message;
      const status = e2?.response?.status;
      if (isNetworkError) {
        setErr("Cannot reach server. Tap 'Changed location? Reset URLs' above, then set Server URL to this computer's IP (e.g. http://192.168.x.x:4000). Emulator: tap 'Use emulator URL'. Ensure Guard API is running: cd abe-guard-ai/backend && node src/server.js");
      } else if (isTimeout) {
        setErr("Request timed out (often after changing location). Tap 'Changed location? Reset URLs', then set Server URL to this computer's IP. Ensure Guard API is running on this machine.");
      } else if (status === 401) {
        setErr(msg || "Invalid email or password");
      } else if (status === 400) {
        setErr(msg || "Email and password required");
      } else if (status === 500) {
        setErr(msg || "Server error. Please try again.");
      } else {
        setErr(msg || "Login failed. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="loginPage auth-no-select">
      <div className="loginBg" />

      <div className="loginShell">
        {/* AI AGENT 24 Animated Header */}
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

        <div className="loginCard">
          <div className="loginHeader">
            <div className="brandMark" aria-hidden="true">
              <span />
            </div>

            <div>
              <h2 className="loginTitle">Guard Login</h2>
              <p className="loginSubtitle">
                Sign in to view shifts and manage callouts
              </p>
            </div>
          </div>

          <div className="roleBadge supervisor">
            <span>Guard Portal</span>
          </div>

          {/* Why connection fails after changing location */}
          <details style={{ marginBottom: 12, fontSize: 11, color: "var(--muted, #888)" }}>
            <summary style={{ cursor: "pointer", textDecoration: "underline" }}>Why does it fail when I change location?</summary>
            <p style={{ marginTop: 6 }}>{WHY_CHANGE_LOCATION}</p>
          </details>

          {showStaleUrlHint && (
            <div style={{ marginBottom: 10, padding: "8px 12px", background: "rgba(251,191,36,0.15)", borderRadius: 8, fontSize: 12, color: "#fcd34d" }}>
              Using a saved IP that may be from a previous location. If login fails, tap <strong>Changed location? Reset URLs</strong> and set Server URL to this computer’s current IP.
            </div>
          )}

          <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="linkBtn"
              style={{ fontSize: 12, fontWeight: 600 }}
              onClick={() => {
                setGuardApiUrl("");
                setAdminApiUrl("");
                setConnectionStatus(null);
                setAdminConnectionStatus(null);
                if (isAndroidApp()) {
                  setServerUrl(EMULATOR_GUARD_URL);
                  setAdminApiUrlState("http://10.0.2.2:5000");
                } else {
                  setServerUrl("http://localhost:4000");
                  setAdminApiUrlState("http://localhost:5000");
                }
                setErr("");
                setShowStaleUrlHint(false);
              }}
            >
              Changed location? Reset URLs
            </button>
            <span style={{ fontSize: 11, color: "var(--muted, #888)" }}>
              Then set Server URL to this computer’s IP (e.g. http://192.168.x.x:4000) if on phone.
            </span>
          </div>

          {/* Editable Server URL – on phone set to http://YOUR_MAC_IP:4000 (same Wi‑Fi), then Test connection */}
          <div className="field" style={{ marginBottom: 8 }}>
            <label className="fieldLabel">Server URL (emulator: 10.0.2.2:4000; phone: Mac IP — update if you changed Wi‑Fi)</label>
            <div className="fieldControl">
              <input
                className="fieldInput"
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                onBlur={() => {
                  const u = serverUrl.trim().replace(/\/+$/, "");
                  if (u && (u.startsWith("http://") || u.startsWith("https://"))) {
                    setGuardApiUrl(u);
                  }
                }}
                placeholder="http://localhost:4000"
                style={{ fontSize: 12 }}
              />
            </div>
            <div className="loginUrlActions" style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="linkBtn"
                style={{ fontSize: 11 }}
                onClick={() => {
                  const u = serverUrl.trim().replace(/\/+$/, "");
                  if (u && (u.startsWith("http://") || u.startsWith("https://"))) {
                    setGuardApiUrl(u);
                  }
                }}
              >
                Save URL
              </button>
              <span style={{ fontSize: 11, color: "var(--muted, #888)" }}>Emulator:</span>
              <code style={{ fontSize: 11, padding: "2px 6px", background: "rgba(255,255,255,0.08)", borderRadius: 6 }}>
                http://10.0.2.2:4000
              </code>
              <button
                type="button"
                className="linkBtn loginEmulatorBtn"
                style={{ fontSize: 11 }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const emulatorUrl = "http://10.0.2.2:4000";
                  setServerUrl(emulatorUrl);
                  setGuardApiUrl(emulatorUrl);
                }}
              >
                Use emulator URL
              </button>
              <button
                type="button"
                className="linkBtn"
                style={{ fontSize: 11 }}
                onClick={() => {
                  const emulatorUrl = "http://10.0.2.2:4000";
                  if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(emulatorUrl).catch(() => {});
                  }
                }}
              >
                Copy emulator URL
              </button>
            </div>
          </div>
          <button
            type="button"
            className="linkBtn"
            style={{ marginBottom: 8, fontSize: 12 }}
            onClick={async () => {
              const url = getGuardApiUrl();
              setConnectionStatus("checking");
              try {
                let r = await fetch(`${url}/health`);
                if (!r.ok && isAndroidApp() && url !== EMULATOR_GUARD_URL && isLanIpUrl(url)) {
                  const fallback = await fetch(`${EMULATOR_GUARD_URL}/health`);
                  if (fallback.ok) {
                    setGuardApiUrl(EMULATOR_GUARD_URL);
                    setServerUrl(EMULATOR_GUARD_URL);
                    setConnectionStatus("ok");
                    return;
                  }
                }
                setConnectionStatus(r.ok ? "ok" : "fail");
              } catch (e) {
                if (isAndroidApp() && getGuardApiUrl() !== EMULATOR_GUARD_URL && isLanIpUrl(getGuardApiUrl())) {
                  try {
                    const fallback = await fetch(`${EMULATOR_GUARD_URL}/health`);
                    if (fallback.ok) {
                      setGuardApiUrl(EMULATOR_GUARD_URL);
                      setServerUrl(EMULATOR_GUARD_URL);
                      setConnectionStatus("ok");
                      return;
                    }
                  } catch (_) {}
                }
                setConnectionStatus("fail");
              }
            }}
          >
            {connectionStatus === "checking" ? "Checking…" : connectionStatus === "ok" ? "✓ Connection OK" : connectionStatus === "fail" ? "✗ Connection failed" : "Test connection"}
          </button>

          {/* Admin API URL – required for shift swap & availability on emulator/phone */}
          <div className="field" style={{ marginBottom: 8 }}>
            <label className="fieldLabel">Admin API URL (shift swap &amp; availability — emulator: 10.0.2.2:5000)</label>
            <div className="fieldControl">
              <input
                className="fieldInput"
                type="url"
                value={adminApiUrl}
                onChange={(e) => setAdminApiUrlState(e.target.value)}
                onBlur={() => {
                  const u = adminApiUrl.trim().replace(/\/+$/, "");
                  if (u && (u.startsWith("http://") || u.startsWith("https://"))) {
                    setAdminApiUrl(u);
                  }
                }}
                placeholder="http://localhost:5000"
                style={{ fontSize: 12 }}
              />
            </div>
            <div className="loginUrlActions" style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="linkBtn"
                style={{ fontSize: 11 }}
                onClick={() => {
                  const u = adminApiUrl.trim().replace(/\/+$/, "");
                  if (u && (u.startsWith("http://") || u.startsWith("https://"))) {
                    setAdminApiUrl(u);
                  }
                }}
              >
                Save
              </button>
              <button
                type="button"
                className="linkBtn loginEmulatorBtn"
                style={{ fontSize: 11 }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const u = "http://10.0.2.2:5000";
                  setAdminApiUrlState(u);
                  setAdminApiUrl(u);
                }}
              >
                Use emulator (10.0.2.2:5000)
              </button>
              <button
                type="button"
                className="linkBtn"
                style={{ fontSize: 11 }}
                onClick={async () => {
                  const url = getAdminApiUrl();
                  setAdminConnectionStatus("checking");
                  try {
                    const r = await fetch(`${url}/health`);
                    setAdminConnectionStatus(r.ok ? "ok" : "fail");
                  } catch (e) {
                    setAdminConnectionStatus("fail");
                  }
                }}
              >
                {adminConnectionStatus === "checking" ? "Checking…" : adminConnectionStatus === "ok" ? "✓ Admin OK" : adminConnectionStatus === "fail" ? "✗ Admin failed" : "Test Admin"}
              </button>
            </div>
          </div>

          {err ? (
            <div className="loginAlert" role="alert">
              <div className="loginAlertDot" />
              <div className="loginAlertText">
                <strong>Login error</strong>
                <span>{err}</span>
              </div>
            </div>
          ) : null}

          <form onSubmit={submit} className="loginForm">
            <div className="field">
              <label className="fieldLabel">Email</label>
              <div className="fieldControl">
                <div className="fieldIcon">@</div>
                <input
                  className="fieldInput"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="guard@email.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="field">
              <label className="fieldLabel">Password</label>
              <div className="fieldControl">
                <div className="fieldIcon">•</div>
                <input
                  className="fieldInput"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="pwToggle"
                  onClick={() => setShowPw((s) => !s)}
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button className="loginBtn" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  Signing in…
                </>
              ) : devToken.trim() ? (
                "Use Dev Token"
              ) : (
                "Login"
              )}
            </button>

            <div className="loginMeta" style={{ marginTop: 14 }}>
              <span>Dev Testing</span>
              <button
                type="button"
                className="linkBtn"
                onClick={() => {
                  setDevToken("");
                  localStorage.removeItem("guardDevToken");
                  // Optional: also clear runtime token
                  localStorage.removeItem("guardToken");
                }}
              >
                Clear saved token
              </button>
            </div>

            <div className="field">
              <label className="fieldLabel">Dev Token (paste JWT)</label>
              <div className="fieldControl" style={{ alignItems: "stretch" }}>
                <textarea
                  className="fieldInput"
                  rows={3}
                  value={devToken}
                  onChange={(e) => setDevToken(e.target.value)}
                  placeholder="Paste JWT here for dev testing"
                  style={{ resize: "vertical" }}
                />
              </div>
            </div>

            <div className="loginFooter">
              <span>ABE Guard</span>
              <span className="dot" />
              <span>Secure Access</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
