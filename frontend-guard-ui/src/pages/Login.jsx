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
  isProbablyAndroidEmulator,
  EMULATOR_GUARD_URL,
  isLanIpUrl,
  DEFAULT_CLOUD_BACKEND,
  rewriteLocalhostForAndroidEmulator,
  normalizeBackendBaseUrl,
} from "../config/apiUrls";
import { nativePost, isNativeCapable, probeBackendBase } from "../utils/nativeHttp";
import { appHardNavigate } from "../utils/appNavigation";

const agentLetterStyle = (animationDelay) => ({ animationDelay });

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
  const [connectionHint, setConnectionHint] = useState("");

  /** What you see in Server URL is what we use — avoids testing stale localStorage. */
  const persistGuardUrlFromField = () => {
    let u = normalizeBackendBaseUrl(serverUrl);
    if (u && u !== serverUrl.trim()) setServerUrl(u);
    if (u.startsWith("http://") || u.startsWith("https://")) {
      const rw = rewriteLocalhostForAndroidEmulator(u);
      if (rw !== u) {
        setServerUrl(rw);
        u = rw;
      }
      setGuardApiUrl(u);
      // Single Railway / one Node host: schedule & messages need the same origin. Legacy split stack uses :4000 for guard only.
      if (!/:4000(\/|$)/.test(u)) {
        setAdminApiUrl(u);
        setAdminApiUrlState(u);
      }
      return u;
    }
    return getGuardApiUrl();
  };

  const persistAdminUrlFromField = () => {
    let u = normalizeBackendBaseUrl(adminApiUrl);
    if (u && u !== adminApiUrl.trim()) setAdminApiUrlState(u);
    if (u.startsWith("http://") || u.startsWith("https://")) {
      const rw = rewriteLocalhostForAndroidEmulator(u);
      if (rw !== u) {
        setAdminApiUrlState(rw);
        u = rw;
      }
      setAdminApiUrl(u);
      return u;
    }
    return getAdminApiUrl();
  };

  // Sync displayed URLs with effective API URLs (e.g. after Android overrides)
  useEffect(() => {
    const guardUrl = getGuardApiUrl();
    const adminUrl = getAdminApiUrl();
    setServerUrl(guardUrl);
    setAdminApiUrlState(adminUrl);
    if (isLanIpUrl(guardUrl)) setShowStaleUrlHint(true);
  }, []);

  // Real phone cannot reach 10.0.2.2 — replace saved emulator URL with cloud backend once.
  useEffect(() => {
    try {
      if (!isAndroidApp() || isProbablyAndroidEmulator()) return;
      const g = (localStorage.getItem("guardApiUrl") || "").trim();
      if (g.includes("10.0.2.2")) {
        const cloud = String(DEFAULT_CLOUD_BACKEND).replace(/\/+$/, "");
        setGuardApiUrl(cloud);
        setAdminApiUrl(cloud);
        setServerUrl(cloud);
        setAdminApiUrlState(cloud);
        setConnectionHint("Using cloud backend.");
      }
    } catch (_) {}
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
        appHardNavigate("/");
        return;
      }

      const em = email.trim();
      const pw = password;

      const baseUrl = persistGuardUrlFromField();

      let token;
      let guardUser;

      if (isNativeCapable()) {
        const res = await nativePost(`${baseUrl}/auth/login`, { email: em, password: pw });
        if (!res.ok) {
          const err = new Error(res.data?.message || res.data?.error || "Login failed");
          err.response = { status: res.status, data: res.data || {} };
          err.code = res.status === 0 ? "ERR_NETWORK" : undefined;
          throw err;
        }
        token = res.data?.token;
        guardUser = res.data?.guard || res.data?.user || null;
      } else {
        const res = await loginGuard(em, pw);
        token = res?.data?.token;
        guardUser = res?.data?.guard || res?.data?.user || null;
      }

      if (!token) throw new Error("No token returned");

      // ✅ Always store the real guard token key
      localStorage.setItem("guardToken", token);

      loginWithToken(token, guardUser);
      appHardNavigate("/");
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
          let retryToken, retryUser;
          if (isNativeCapable()) {
            const res = await nativePost(`${EMULATOR_GUARD_URL}/auth/login`, { email: email.trim(), password });
            if (res.ok && res.data?.token) {
              retryToken = res.data.token;
              retryUser = res.data?.guard || res.data?.user || null;
            }
          } else {
            const retryRes = await loginGuard(email.trim(), password);
            retryToken = retryRes?.data?.token;
            retryUser = retryRes?.data?.guard || retryRes?.data?.user || null;
          }
          if (retryToken) {
            localStorage.setItem("guardToken", retryToken);
            loginWithToken(retryToken, retryUser);
            appHardNavigate("/");
            return;
          }
        } catch (_) {
          // Fall through to show error below
        }
      }

      const msg = e2?.response?.data?.message || e2?.response?.data?.error || e2?.message;
      const status = e2?.response?.status;
      if (isNetworkError) {
        setErr("Cannot reach server. Check Server URL or tap Railway.");
      } else if (isTimeout) {
        setErr("Request timed out. Check Server URL.");
      } else if (status === 401) {
        setErr(msg || "Invalid email or password");
      } else if (status === 423) {
        setErr(msg || "Account locked. Contact an administrator to unlock.");
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
            <span className="aiAgentLetter" style={agentLetterStyle("0s")}>A</span>
            <span className="aiAgentLetter" style={agentLetterStyle("0.1s")}>I</span>
            <span className="aiAgentSpace"> </span>
            <span className="aiAgentLetter" style={agentLetterStyle("0.2s")}>A</span>
            <span className="aiAgentLetter" style={agentLetterStyle("0.3s")}>G</span>
            <span className="aiAgentLetter" style={agentLetterStyle("0.4s")}>E</span>
            <span className="aiAgentLetter" style={agentLetterStyle("0.5s")}>N</span>
            <span className="aiAgentLetter" style={agentLetterStyle("0.6s")}>T</span>
            <span className="aiAgentSpace"> </span>
            <span className="aiAgentLetter" style={agentLetterStyle("0.7s")}>2</span>
            <span className="aiAgentLetter" style={agentLetterStyle("0.8s")}>4</span>
          </h1>
        </div>

        <div className="loginCard">
          <div className="loginHeader">
            <div className="brandMark" aria-hidden="true">
              <span />
            </div>

            <div>
              <h2 className="loginTitle">Guard Login</h2>
            </div>
          </div>

          {showStaleUrlHint && (
            <div style={{ marginBottom: 10, padding: "8px 12px", background: "rgba(251,191,36,0.15)", borderRadius: 8, fontSize: 12, color: "#fcd34d" }}>
              Saved server URL may be outdated. Tap Reset URLs if login fails.
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="linkBtn"
              style={{ fontSize: 12, fontWeight: 600 }}
              onClick={() => {
                setGuardApiUrl("");
                setAdminApiUrl("");
                setConnectionStatus(null);
                setAdminConnectionStatus(null);
                try {
                  localStorage.removeItem("guardToken");
                  localStorage.removeItem("guardUser");
                  localStorage.removeItem("guardDevToken");
                } catch (_) {}
                if (isAndroidApp()) {
                  const cloud = String(DEFAULT_CLOUD_BACKEND).replace(/\/+$/, "");
                  setServerUrl(cloud);
                  setAdminApiUrlState(cloud);
                } else {
                  setServerUrl("http://localhost:4000");
                  setAdminApiUrlState("http://localhost:5000");
                }
                setErr("");
                setShowStaleUrlHint(false);
              }}
            >
              Reset URLs
            </button>
          </div>

          <div className="field" style={{ marginBottom: 8 }}>
            <label className="fieldLabel">Server URL</label>
            <div className="fieldControl">
              <input
                className="fieldInput"
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                onBlur={() => persistGuardUrlFromField()}
                placeholder="http://localhost:4000"
                style={{ fontSize: 12 }}
              />
            </div>
            <div className="loginUrlActions" style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="linkBtn"
                style={{ fontSize: 11 }}
                onClick={() => persistGuardUrlFromField()}
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
                  const emulatorUrl = EMULATOR_GUARD_URL;
                  setServerUrl(emulatorUrl);
                  setGuardApiUrl(emulatorUrl);
                  setAdminApiUrlState(emulatorUrl);
                  setAdminApiUrl(emulatorUrl);
                }}
              >
                Emulator
              </button>
              <button
                type="button"
                className="linkBtn"
                style={{ fontSize: 11, fontWeight: 600 }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const railwayUrl = (typeof process !== "undefined" && process.env?.REACT_APP_DEFAULT_BACKEND_URL) || "https://admin-dashboard-production-2596.up.railway.app";
                  const u = String(railwayUrl).replace(/\/+$/, "");
                  setServerUrl(u);
                  setAdminApiUrlState(u);
                  setGuardApiUrl(u);
                  setAdminApiUrl(u);
                  setErr("");
                }}
              >
                Railway
              </button>
            </div>
          </div>
          <button
            type="button"
            className="linkBtn"
            style={{ marginBottom: 8, fontSize: 12 }}
            onClick={async () => {
              const url = persistGuardUrlFromField();
              setConnectionStatus("checking");
              setConnectionHint("");
              try {
                let r = await probeBackendBase(url);
                if (!r.ok && isAndroidApp() && url !== EMULATOR_GUARD_URL && isLanIpUrl(url)) {
                  const fallback = await probeBackendBase(EMULATOR_GUARD_URL);
                  if (fallback.ok) {
                    setGuardApiUrl(EMULATOR_GUARD_URL);
                    setAdminApiUrl(EMULATOR_GUARD_URL);
                    setServerUrl(EMULATOR_GUARD_URL);
                    setAdminApiUrlState(EMULATOR_GUARD_URL);
                    setConnectionStatus("ok");
                    setConnectionHint("Using emulator URL.");
                    return;
                  }
                }
                setConnectionStatus(r.ok ? "ok" : "fail");
                if (!r.ok) {
                  setConnectionHint(r.error || (r.status ? `Failed (${r.status})` : "Cannot reach server."));
                }
              } catch (e) {
                setConnectionStatus("fail");
                setConnectionHint(e?.message || "Connection failed.");
              }
            }}
          >
            {connectionStatus === "checking" ? "Checking…" : connectionStatus === "ok" ? "Connected" : connectionStatus === "fail" ? "Failed" : "Test connection"}
          </button>
          {connectionHint ? (
            <p style={{ fontSize: 11, color: "var(--muted, #aaa)", margin: "6px 0 12px", lineHeight: 1.4 }}>{connectionHint}</p>
          ) : null}

          <div className="field" style={{ marginBottom: 8 }}>
            <label className="fieldLabel">Admin API URL</label>
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
                  const u = EMULATOR_GUARD_URL;
                  setAdminApiUrlState(u);
                  setAdminApiUrl(u);
                }}
              >
                Emulator
              </button>
              <button
                type="button"
                className="linkBtn"
                style={{ fontSize: 11 }}
                onClick={async () => {
                  const url = persistAdminUrlFromField();
                  setAdminConnectionStatus("checking");
                  try {
                    const r = await probeBackendBase(url);
                    setAdminConnectionStatus(r.ok ? "ok" : "fail");
                  } catch (e) {
                    setAdminConnectionStatus("fail");
                  }
                }}
              >
                {adminConnectionStatus === "checking" ? "Checking…" : adminConnectionStatus === "ok" ? "Connected" : adminConnectionStatus === "fail" ? "Failed" : "Test"}
              </button>
            </div>
          </div>

          {err ? (
            <div className="loginAlert" role="alert">
              <div className="loginAlertDot" />
              <div className="loginAlertText">
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
              ) : (
                "Sign in"
              )}
            </button>

            <details className="loginAdvanced" style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>Advanced</summary>
              <div className="field" style={{ marginTop: 10 }}>
                <label className="fieldLabel">Dev token</label>
                <div className="fieldControl" style={{ alignItems: "stretch" }}>
                  <textarea
                    className="fieldInput"
                    rows={2}
                    value={devToken}
                    onChange={(e) => setDevToken(e.target.value)}
                    placeholder="JWT"
                    style={{ resize: "vertical" }}
                  />
                </div>
                <button
                  type="button"
                  className="linkBtn"
                  style={{ marginTop: 6, fontSize: 11 }}
                  onClick={() => {
                    setDevToken("");
                    localStorage.removeItem("guardDevToken");
                    localStorage.removeItem("guardToken");
                  }}
                >
                  Clear token
                </button>
              </div>
            </details>
          </form>
        </div>
      </div>
    </div>
  );
}
