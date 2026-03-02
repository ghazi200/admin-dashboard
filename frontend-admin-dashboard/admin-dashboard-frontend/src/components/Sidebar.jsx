import React from "react";
import { NavLink } from "react-router-dom";
import { hasAccess } from "../utils/access";

export default function Sidebar({ onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="brandPill">
        <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Scheduling</div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Guards · Shifts · Callouts</div>
      </div>

      <NavItem to="/" label="Dashboard" icon="🏠" onNavigate={onNavigate} />
      <NavItem to="/guards" label="Guards" icon="🧑‍✈️" onNavigate={onNavigate} />
      <NavItem to="/shifts" label="Shifts" icon="🗓️" onNavigate={onNavigate} />
      <NavItem to="/shift-swaps" label="Shift Swaps" icon="🔄" onNavigate={onNavigate} />
      <NavItem to="/schedule-generation" label="Auto Schedule" icon="🤖" onNavigate={onNavigate} />
      {hasAccess("shifts:read") && <NavItem to="/fairness-rebalancing" label="Fairness" icon="⚖️" onNavigate={onNavigate} />}
      <NavItem to="/callout-risk" label="Callout Risk" icon="⚠️" onNavigate={onNavigate} />
      <NavItem to="/payroll" label="Payroll" icon="💰" onNavigate={onNavigate} />
      <NavItem to="/messages" label="Messages" icon="💬" onNavigate={onNavigate} />

      {/* Admin-only (or users:read) */}
      {hasAccess("users:read") && <NavItem to="/users" label="Users" icon="👤" onNavigate={onNavigate} />}
      {(hasAccess("users:write") || hasAccess("admin")) && <NavItem to="/email-scheduler-settings" label="Email Settings" icon="📧" onNavigate={onNavigate} />}
    </aside>
  );
}

function NavItem({ to, icon, label, onNavigate }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `navLink ${isActive ? "navLinkActive" : ""}`}
      onClick={onNavigate}
    >
      <span style={{ width: 22, textAlign: "center" }}>{icon}</span>
      <span style={{ fontWeight: 700 }}>{label}</span>
    </NavLink>
  );
}
