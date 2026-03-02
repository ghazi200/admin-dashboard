import React, { useEffect } from "react";

export default function Modal({ title, children, onClose, footer }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={s.backdrop} onMouseDown={onClose}>
      <div style={s.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={{ fontWeight: 800 }}>{title}</div>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={s.body}>{children}</div>

        {footer ? <div style={s.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    zIndex: 9999,
  },
  modal: {
    width: "min(860px, 96vw)",
    maxHeight: "88vh",
    overflow: "hidden",
    borderRadius: 18,
    background: "rgba(20,22,34,0.98)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  body: { padding: 14, overflow: "auto" },
  footer: {
    padding: 14,
    borderTop: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },
};
