import React, { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Clock from "./Clock";
import "./NavBar.css";

const NAV_ITEMS = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "📊 Dashboard" },
  { to: "/ask-policy", label: "Ask Policy" },
  { to: "/payroll", label: "💰 Payroll Assistant" },
  { to: "/shifts", label: "Shifts" },
  { to: "/timeclock", label: "Timeclock" },
  { to: "/callouts", label: "Callouts" },
  { to: "/schedule", label: "Schedule" },
  { to: "/messages", label: "💬 Messages" },
  { to: "/shifts/swap", label: "Shift Swaps" },
  { to: "/shifts/availability", label: "Availability" },
  { to: "/shifts/history", label: "History" },
  { to: "/incident", label: "Report Incident" },
  { to: "/emergency", label: "🚨 Emergency SOS" },
];

export default function NavBar() {
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [menuOpen]);

  const Item = ({ to, label, onClick }) => (
    <Link
      className={`navItem ${pathname === to ? "active" : ""}`}
      to={to}
      onClick={onClick}
    >
      {label}
    </Link>
  );

  const isMobileOrCapacitor =
    typeof window !== "undefined" &&
    (window.Capacitor || window.innerWidth <= 900);

  return (
    <div className={`nav ${isMobileOrCapacitor ? "nav--mobile" : ""}`}>
      <div className="navLeft" ref={menuRef}>
        <button
          type="button"
          className="navHamburger"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          aria-label="Open menu"
          aria-expanded={menuOpen}
        >
          <span className="navHamburgerBar" />
          <span className="navHamburgerBar" />
          <span className="navHamburgerBar" />
        </button>
        <div className="brand">ABE Guard</div>
        {menuOpen && (
          <div className="navDropdown">
            {NAV_ITEMS.map(({ to, label }) => (
              <Item
                key={to}
                to={to}
                label={label}
                onClick={() => setMenuOpen(false)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="navRight">
        <Clock />
        <Link to="/account" className="btn" style={{ marginRight: 8 }}>
          Account
        </Link>
        <button className="btn" onClick={logout}>Logout</button>
      </div>
    </div>
  );
}
