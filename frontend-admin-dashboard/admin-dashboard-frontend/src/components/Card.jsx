import React from "react";

/** Visible on dark UI; border beats a 1px shadow (often lost when parent overrides boxShadow). */
const CARD_WHITE_OUTLINE = "2px solid rgba(255,255,255,0.72)";

const ORANGE_CARD_SURFACE = {
  background: "linear-gradient(135deg, rgba(249, 115, 22, 0.42), rgba(234, 88, 12, 0.28))",
  border: CARD_WHITE_OUTLINE,
  boxShadow:
    "0 18px 60px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(249, 115, 22, 0.35)",
};

export default function Card({ title, subtitle, right, children, style, className, variant }) {
  const variantStyle = variant === "orange" ? ORANGE_CARD_SURFACE : {};
  return (
    <section className={className} style={{ ...s.card, ...variantStyle, ...style }}>
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
    border: CARD_WHITE_OUTLINE,
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
