import React, { useState } from "react";

export default function RunningLateDropdown({ onSubmit, disabled }) {
  const [open, setOpen] = useState(false);
  const [minutesLate, setMinutesLate] = useState(5);
  const [reason, setReason] = useState("");

  const submit = () => {
    onSubmit?.({ minutesLate, reason });
    setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      {/* 🟠 Running Late trigger */}
      <button
        className="btn state--warn"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        Running Late
      </button>

      {open && (
        <div
          className="dropdown"
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            zIndex: 20,
            minWidth: 240,
            padding: 12,
            borderRadius: 14,
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(245,158,11,0.35)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div className="field">
            <label className="label">Minutes late</label>
            <select
              className="select"
              value={minutesLate}
              onChange={(e) => setMinutesLate(Number(e.target.value))}
            >
              {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <label className="label">Reason</label>
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Train delay, traffic, etc."
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {/* 🟠 Submit stays amber */}
            <button className="btn state--warn" onClick={submit}>
              Submit
            </button>

            <button
              className="btn"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
