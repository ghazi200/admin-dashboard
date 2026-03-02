import React from "react";

export default function Card({ title, subtitle, right, children, style }) {
  return (
    <section style={{ ...s.card, ...style }}>
      {(title || subtitle || right) && (
        <header style={s.head}>
          <div>
            {title ? <div style={s.title}>{title}</div> : null}
            {subtitle ? <div style={s.sub}>{subtitle}</div> : null}
          </div>
          {right ? <div>{right}</div> : null}
        </header>
      )}
      <div style={s.body}>{children}</div>
    </section>
  );
}

const s = {
  card: {
    borderRadius: 18,
    border: "1px solid rgba(148,163,184,0.18)",
    background: "rgba(255,255,255,0.03)",
    boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
    overflow: "hidden",
  },
  head: {
    padding: "14px 14px 10px 14px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    borderBottom: "1px solid rgba(148,163,184,0.14)",
    background: "rgba(255,255,255,0.02)",
  },
  title: { fontWeight: 800, letterSpacing: 0.2 },
  sub: { marginTop: 4, fontSize: 12, opacity: 0.75, lineHeight: 1.35 },
  body: { padding: 14 },
};
