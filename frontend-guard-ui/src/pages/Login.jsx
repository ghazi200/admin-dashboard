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
import { isProductionBuild } from "../config/buildFlags";

const agentLetterStyle = (animationDelay) => ({ animationDelay });

export default function Login() {
  const { loginWithToken } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devToken, setDevToken] = useState("");
  const [err, setErr] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => getGuardApiUrl());
  const [adminApiUrl, setAdminApiUrlState] = useState(() => getAdminApiUrl());

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

  useEffect(() => {
    setServerUrl(getGuardApiUrl());
    setAdminApiUrlState(getAdminApiUrl());
  }, []);

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
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (localStorage.getItem("guardJustLoggedOut") === "1") {
      localStorage.removeItem("guardJustLoggedOut");
    }
  }, []);

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
      if (devToken.trim()) {
        if (isProductionBuild) {
          setErr("Dev token login is disabled.");
          return;
        }
        const t = devToken.trim();
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
          const errObj = new Error(res.data?.message || res.data?.error || "Login failed");
          errObj.response = { status: res.status, data: res.data || {} };
          errObj.code = res.status === 0 ? "ERR_NETWORK" : undefined;
          throw errObj;
        }
        token = res.data?.token;
        guardUser = res.data?.guard || res.data?.user || null;
      } else {
        const res = await loginGuard(em, pw);
        token = res?.data?.token;
        guardUser = res?.data?.guard || res?.data?.user || null;
      }

      if (!token) throw new Error("Login failed");

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
        } catch (_) {}
      }

      const msg = e2?.response?.data?.message || e2?.response?.data?.error || e2?.message;
      const status = e2?.response?.status;
      if (isNetworkError) {
        setErr("Cannot reach server");
      } else if (isTimeout) {
        setErr("Request timed out");
      } else if (status === 401) {
        setErr(msg || "Invalid email or password");
      } else if (status === 423) {
        setErr(msg || "Account locked");
      } else if (status === 400) {
        setErr(msg || "Email and password required");
      } else {
        setErr(msg || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetUrls = () => {
    setGuardApiUrl("");
    setAdminApiUrl("");
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
  };

  const applyRailway = () => {
    const railwayUrl =
      (typeof process !== "undefined" && process.env?.REACT_APP_DEFAULT_BACKEND_URL) ||
      "https://admin-dashboard-production-2596.up.railway.app";
    const u = String(railwayUrl).replace(/\/+$/, "");
    setServerUrl(u);
    setAdminApiUrlState(u);
    setGuardApiUrl(u);
    setAdminApiUrl(u);
    setErr("");
  };

  const applyEmulator = () => {
    setServerUrl(EMULATOR_GUARD_URL);
    setGuardApiUrl(EMULATOR_GUARD_URL);
    setAdminApiUrlState(EMULATOR_GUARD_URL);
    setAdminApiUrl(EMULATOR_GUARD_URL);
  };

  return (
    <div className="loginPage auth-no-select">
      <div className="loginBg" />

      <div className="loginShell">
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

            {!isProductionBuild && (
            <details className="loginAdvanced" style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>
                Settings
              </summary>
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" className="linkBtn" style={{ fontSize: 11 }} onClick={resetUrls}>
                  Reset
                </button>
                <button type="button" className="linkBtn" style={{ fontSize: 11 }} onClick={applyEmulator}>
                  Emulator
                </button>
                <button type="button" className="linkBtn" style={{ fontSize: 11 }} onClick={applyRailway}>
                  Railway
                </button>
                <button
                  type="button"
                  className="linkBtn"
                  style={{ fontSize: 11 }}
                  onClick={() => probeBackendBase(persistGuardUrlFromField())}
                >
                  Test
                </button>
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label className="fieldLabel">Server URL</label>
                <div className="fieldControl">
                  <input
                    className="fieldInput"
                    type="url"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    onBlur={() => persistGuardUrlFromField()}
                    style={{ fontSize: 12 }}
                  />
                </div>
              </div>
              <div className="field" style={{ marginTop: 8 }}>
                <label className="fieldLabel">Admin API URL</label>
                <div className="fieldControl">
                  <input
                    className="fieldInput"
                    type="url"
                    value={adminApiUrl}
                    onChange={(e) => setAdminApiUrlState(e.target.value)}
                    onBlur={() => persistAdminUrlFromField()}
                    style={{ fontSize: 12 }}
                  />
                </div>
              </div>
              <div className="field" style={{ marginTop: 10 }}>
                <label className="fieldLabel">Dev token</label>
                <div className="fieldControl" style={{ alignItems: "stretch" }}>
                  <textarea
                    className="fieldInput"
                    rows={2}
                    value={devToken}
                    onChange={(e) => setDevToken(e.target.value)}
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
                  Clear
                </button>
              </div>
            </details>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
