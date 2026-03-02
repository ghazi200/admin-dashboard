import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMe,
  changePassword as apiChangePassword,
  logoutOtherDevices as apiLogoutOtherDevices,
  mfaSetup,
  mfaVerifySetup,
  mfaDisable,
} from "../services/api";
import Card from "../components/Card";

export default function AccountSecurity() {
  const queryClient = useQueryClient();

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMessage, setPwMessage] = useState("");

  const [mfaChannel, setMfaChannel] = useState("email");
  const [mfaPhone, setMfaPhone] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaStep, setMfaStep] = useState("choose"); // choose | code | done
  const [mfaMessage, setMfaMessage] = useState("");

  const [disablePassword, setDisablePassword] = useState("");
  const [disableMessage, setDisableMessage] = useState("");

  const [logoutOthersMessage, setLogoutOthersMessage] = useState("");

  const { data: me, isLoading: meLoading, error: meError } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await getMe();
      return res.data;
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }) =>
      apiChangePassword(currentPassword, newPassword),
    onSuccess: () => {
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
      setPwMessage("Password updated successfully.");
      setTimeout(() => setPwMessage(""), 3000);
    },
    onError: (err) => {
      setPwMessage(err?.response?.data?.message || "Failed to change password.");
    },
  });

  const mfaSetupMutation = useMutation({
    mutationFn: () =>
      mfaSetup(mfaChannel, mfaChannel === "sms" ? { phone: mfaPhone } : {}),
    onSuccess: () => {
      setMfaStep("code");
      setMfaMessage("Verification code sent. Enter it below.");
    },
    onError: (err) => {
      setMfaMessage(err?.response?.data?.message || "Failed to send code.");
    },
  });

  const mfaVerifyMutation = useMutation({
    mutationFn: () => mfaVerifySetup(mfaCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      setMfaStep("done");
      setMfaCode("");
      setMfaMessage("MFA enabled successfully.");
    },
    onError: (err) => {
      setMfaMessage(err?.response?.data?.message || "Invalid or expired code.");
    },
  });

  const mfaDisableMutation = useMutation({
    mutationFn: () => mfaDisable(disablePassword),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      setDisablePassword("");
      setDisableMessage("MFA disabled.");
    },
    onError: (err) => {
      setDisableMessage(err?.response?.data?.message || "Failed to disable MFA.");
    },
  });

  const logoutOtherDevicesMutation = useMutation({
    mutationFn: () => apiLogoutOtherDevices(),
    onSuccess: (res) => {
      const { token, admin } = res.data || {};
      if (token) {
        localStorage.setItem("adminToken", token);
        if (admin) {
          localStorage.setItem("adminUser", JSON.stringify(admin));
          localStorage.setItem("adminInfo", JSON.stringify(admin));
        }
      }
      queryClient.invalidateQueries({ queryKey: ["me"] });
      setLogoutOthersMessage("All other devices have been logged out. You stay signed in on this device.");
      setTimeout(() => setLogoutOthersMessage(""), 5000);
    },
    onError: (err) => {
      setLogoutOthersMessage(err?.response?.data?.message || "Failed to log out other devices.");
    },
  });

  const handleChangePassword = (e) => {
    e.preventDefault();
    setPwMessage("");
    if (!pwCurrent || !pwNew || !pwConfirm) {
      setPwMessage("Fill all password fields.");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwMessage("New password and confirmation do not match.");
      return;
    }
    changePasswordMutation.mutate({ currentPassword: pwCurrent, newPassword: pwNew });
  };

  const handleMfaSetup = (e) => {
    e.preventDefault();
    setMfaMessage("");
    if (mfaChannel === "sms" && !mfaPhone.trim()) {
      setMfaMessage("Enter your phone number for SMS.");
      return;
    }
    mfaSetupMutation.mutate();
  };

  const handleMfaVerify = (e) => {
    e.preventDefault();
    if (!mfaCode.trim()) {
      setMfaMessage("Enter the 6-digit code.");
      return;
    }
    mfaVerifyMutation.mutate();
  };

  const handleMfaDisable = (e) => {
    e.preventDefault();
    if (!disablePassword) {
      setDisableMessage("Enter your current password to disable MFA.");
      return;
    }
    mfaDisableMutation.mutate();
  };

  const resetMfaFlow = () => {
    setMfaStep("choose");
    setMfaCode("");
    setMfaMessage("");
  };

  const mfaEnabled = !!me?.mfa_enabled;
  const mfaChannelLabel = me?.mfa_channel === "sms" ? "SMS" : "Email";

  const errorMessage = meError?.response?.data?.message || meError?.message || "Failed to load account.";

  return (
    <div style={{ padding: 24, maxWidth: 560, minHeight: 400, color: "#0f172a", background: "#fff" }}>
      <h1 style={{ marginBottom: 24, fontWeight: 800, color: "#0f172a" }}>Account & Security</h1>
      {meLoading ? (
        <p style={{ marginBottom: 24, color: "#64748b" }}>Loading…</p>
      ) : meError ? (
        <p style={{ marginBottom: 24, padding: 12, background: "#fef2f2", color: "#b91c1c", borderRadius: 8 }}>
          {errorMessage}
        </p>
      ) : null}

      <Card
        title="Sessions"
        subtitle="Only one session is valid at a time. New login or this action signs out other devices."
        style={{ marginBottom: 24 }}
      >
        <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>
          Sign out all other devices and browsers. You will stay signed in on this device.
        </p>
        {logoutOthersMessage && (
          <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>{logoutOthersMessage}</p>
        )}
        <button
          type="button"
          className="btn"
          style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" }}
          disabled={logoutOtherDevicesMutation.isPending}
          onClick={() => logoutOtherDevicesMutation.mutate()}
        >
          {logoutOtherDevicesMutation.isPending ? "Signing out others…" : "Log out all other devices"}
        </button>
      </Card>

      <Card title="Change password" subtitle="Update your login password" style={{ marginBottom: 24 }}>
        <form onSubmit={handleChangePassword}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Current password</label>
            <input
              type="password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              className="input"
              style={{ width: "100%", maxWidth: 320 }}
              autoComplete="current-password"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>New password</label>
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              className="input"
              style={{ width: "100%", maxWidth: 320 }}
              autoComplete="new-password"
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Confirm new password</label>
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              className="input"
              style={{ width: "100%", maxWidth: 320 }}
              autoComplete="new-password"
            />
          </div>
          {pwMessage && <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>{pwMessage}</p>}
          <button type="submit" className="btn btnPrimary" disabled={changePasswordMutation.isPending}>
            {changePasswordMutation.isPending ? "Updating…" : "Update password"}
          </button>
        </form>
      </Card>

      <Card
        title="Two-factor authentication (MFA)"
        subtitle="Receive a code by SMS or email when signing in"
        style={{ marginBottom: 24 }}
      >
        {mfaEnabled ? (
          <>
            <p style={{ marginBottom: 16 }}>
              MFA is <strong>on</strong> via <strong>{mfaChannelLabel}</strong>.
            </p>
            <form onSubmit={handleMfaDisable}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
                  Current password (to disable MFA)
                </label>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  className="input"
                  style={{ width: "100%", maxWidth: 320 }}
                  autoComplete="current-password"
                />
              </div>
              {disableMessage && (
                <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>{disableMessage}</p>
              )}
              <button
                type="submit"
                className="btn"
                style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}
                disabled={mfaDisableMutation.isPending}
              >
                {mfaDisableMutation.isPending ? "Disabling…" : "Disable MFA"}
              </button>
            </form>
          </>
        ) : (
          <>
            {mfaStep === "choose" && (
              <form onSubmit={handleMfaSetup}>
                <p style={{ marginBottom: 12, fontSize: 13 }}>Choose how to receive your verification code:</p>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <input
                      type="radio"
                      name="mfaChannel"
                      checked={mfaChannel === "email"}
                      onChange={() => setMfaChannel("email")}
                    />
                    Email (to {me?.email || "your account email"})
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="radio"
                      name="mfaChannel"
                      checked={mfaChannel === "sms"}
                      onChange={() => setMfaChannel("sms")}
                    />
                    SMS to phone number
                  </label>
                </div>
                {mfaChannel === "sms" && (
                  <div style={{ marginBottom: 12 }}>
                    <input
                      type="tel"
                      value={mfaPhone}
                      onChange={(e) => setMfaPhone(e.target.value)}
                      placeholder="+1234567890"
                      className="input"
                      style={{ width: "100%", maxWidth: 280 }}
                    />
                  </div>
                )}
                {mfaMessage && <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>{mfaMessage}</p>}
                <button type="submit" className="btn btnPrimary" disabled={mfaSetupMutation.isPending}>
                  {mfaSetupMutation.isPending ? "Sending code…" : "Send verification code"}
                </button>
              </form>
            )}
            {mfaStep === "code" && (
              <form onSubmit={handleMfaVerify}>
                <p style={{ marginBottom: 12, fontSize: 13 }}>
                  Enter the 6-digit code we sent to your {mfaChannel === "sms" ? "phone" : "email"}.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="input"
                  style={{ width: 120, marginBottom: 12 }}
                />
                {mfaMessage && <p style={{ marginBottom: 12, fontSize: 13, color: "var(--muted)" }}>{mfaMessage}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" className="btn btnPrimary" disabled={mfaVerifyMutation.isPending}>
                    {mfaVerifyMutation.isPending ? "Verifying…" : "Verify and enable MFA"}
                  </button>
                  <button type="button" className="btn" onClick={resetMfaFlow}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {mfaStep === "done" && (
              <p style={{ color: "var(--success, #22c55e)" }}>{mfaMessage}</p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
