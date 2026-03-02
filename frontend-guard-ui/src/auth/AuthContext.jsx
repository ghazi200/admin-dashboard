import React, { createContext, useContext, useMemo, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("guardToken"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("guardUser");
    return raw ? JSON.parse(raw) : null;
  });

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

  window.location.href = "/login";
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
