import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { appHardNavigate } from "../utils/appNavigation";

const AuthContext = createContext(null);

function readGuardUser() {
  try {
    const raw = localStorage.getItem("guardUser");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    try {
      localStorage.removeItem("guardUser");
    } catch (_) {}
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("guardToken"));
  const [user, setUser] = useState(() => readGuardUser());

  useEffect(() => {
    // Native guard app requirement: always start on login after a cold app launch.
    // sessionStorage survives in-app navigation but resets on fresh process start.
    if (typeof window === "undefined" || !window.Capacitor) return;
    const bootKey = "guardNativeBootAuthCleared";
    if (sessionStorage.getItem(bootKey) === "1") return;

    localStorage.removeItem("guardDevToken");
    localStorage.removeItem("guardToken");
    localStorage.removeItem("guardUser");
    setToken(null);
    setUser(null);
    sessionStorage.setItem(bootKey, "1");
  }, []);

  const loginWithToken = (jwt, userObj = null) => {
    localStorage.setItem("guardToken", jwt);
    setToken(jwt);

    if (userObj) {
      localStorage.setItem("guardUser", JSON.stringify(userObj));
      setUser(userObj);
    }
  };

 const logout = () => {
  // ✅ prevents auto-login loop
  localStorage.setItem("guardJustLoggedOut", "1");

  // ✅ clear all guard tokens
  localStorage.removeItem("guardDevToken");
  localStorage.removeItem("guardToken");
  localStorage.removeItem("guardUser");

  setToken?.(null);
  setUser?.(null);

  appHardNavigate("/login");
};

  const value = useMemo(
    () => ({ token, user, loginWithToken, logout, isAuthed: !!token }),
    [token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
