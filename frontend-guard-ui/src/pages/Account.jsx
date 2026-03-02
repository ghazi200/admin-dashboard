import React from "react";
import NavBar from "../components/NavBar";
import { useAuth } from "../auth/AuthContext";

export default function Account() {
  const auth = useAuth();
  const user = auth?.user ?? null;

  return (
    <div>
      <NavBar />
      <div className="page" style={{ padding: 24, maxWidth: 560 }}>
        <h1 style={{ marginBottom: 24, fontWeight: 800 }}>Account</h1>
        <div
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 4 }}>Signed in as</div>
          <div style={{ fontWeight: 600 }}>{user?.name || user?.email || "Guard"}</div>
          {user?.email && user?.name !== user?.email ? (
            <div style={{ fontSize: 14, marginTop: 4, color: "var(--muted2)" }}>{user.email}</div>
          ) : null}
        </div>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          Account preferences and security options can be added here (e.g. notification settings, contact info).
        </p>
      </div>
    </div>
  );
}
