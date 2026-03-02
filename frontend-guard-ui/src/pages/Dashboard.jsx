// src/pages/Dashboard.jsx
// Combined Personal Dashboard (#22) + Performance Scorecard (#23) + Achievements (#34)
import React, { useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import { getGuardDashboard } from "../services/guardApi";
import ShiftAlerts from "../components/ShiftAlerts";
import "./home.css";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError(null);
      const response = await getGuardDashboard();
      setData(response.data);
    } catch (err) {
      console.error("Error loading dashboard:", err);
      console.error("Error response:", err?.response);
      console.error("Error data:", err?.response?.data);
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || err?.message || "Failed to load dashboard";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>
          <div>Loading dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ color: "#ef4444", marginBottom: 16 }}>Error: {error}</div>
          <button className="btn" onClick={loadDashboard}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container">
        <NavBar />
        <div style={{ padding: 40, textAlign: "center" }}>
          <div>No data available</div>
        </div>
      </div>
    );
  }

  const { upcomingShifts, performance, earnings, achievements, streaks } = data;

  return (
    <div className="container">
      <NavBar />
      <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ marginBottom: 24, fontSize: 28, fontWeight: 700 }}>
          My Dashboard
        </h1>

        {/* Quick Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
          <StatCard
            title="Upcoming Shifts"
            value={upcomingShifts?.length || 0}
            subtitle="Next 7 days"
            icon="📅"
          />
          <StatCard
            title="Hours This Week"
            value={earnings?.thisWeek?.hours?.toFixed(1) || "0.0"}
            subtitle="hours"
            icon="⏰"
          />
          <StatCard
            title="Performance Score"
            value={`${performance?.overallScore?.toFixed(0) || 0}%`}
            subtitle="Overall"
            icon="⭐"
          />
          <StatCard
            title="Current Streak"
            value={streaks?.onTime || 0}
            subtitle="On-time days"
            icon="🔥"
          />
        </div>

        {/* Performance Scorecard */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16, fontSize: 20, fontWeight: 600 }}>
            Performance Scorecard
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <CircularProgress
              label="Reliability"
              value={performance?.reliabilityScore || 0}
              color="#22c55e"
            />
            <CircularProgress
              label="On-Time"
              value={performance?.onTimePercentage || 0}
              color="#3b82f6"
            />
            <CircularProgress
              label="Completion"
              value={performance?.completionRate || 0}
              color="#8b5cf6"
            />
            <CircularProgress
              label="Callout Rate"
              value={100 - (performance?.calloutRate || 0)}
              color={performance?.calloutRate > 10 ? "#ef4444" : "#22c55e"}
              inverse={true}
            />
          </div>
        </div>

        {/* Earnings Summary */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16, fontSize: 20, fontWeight: 600 }}>
            Hours & Earnings
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <EarningsCard
              title="This Week"
              hours={earnings?.thisWeek?.hours || 0}
            />
            <EarningsCard
              title="This Month"
              hours={earnings?.thisMonth?.hours || 0}
            />
            <EarningsCard
              title="Total Hours"
              hours={earnings?.totalHours || 0}
            />
            <EarningsCard
              title="Upcoming"
              hours={earnings?.upcoming?.hours || 0}
            />
          </div>
        </div>

        {/* Achievements */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16, fontSize: 20, fontWeight: 600 }}>
            Achievements & Badges
          </h2>
          {achievements?.earned?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 500, opacity: 0.8 }}>
                Earned Badges
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                {achievements.earned.map((badge) => (
                  <BadgeCard key={badge.id} badge={badge} earned={true} />
                ))}
              </div>
            </div>
          )}
          {achievements?.inProgress?.length > 0 && (
            <div>
              <h3 style={{ marginBottom: 12, fontSize: 16, fontWeight: 500, opacity: 0.8 }}>
                In Progress
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {achievements.inProgress.map((badge) => (
                  <BadgeCard key={badge.id} badge={badge} earned={false} />
                ))}
              </div>
            </div>
          )}
          {(!achievements?.earned?.length && !achievements?.inProgress?.length) && (
            <div style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>
              Complete shifts to earn your first badge!
            </div>
          )}
        </div>

        {/* Upcoming Shifts */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16, fontSize: 20, fontWeight: 600 }}>
            Upcoming Shifts
          </h2>
          {upcomingShifts?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {upcomingShifts.map((shift) => (
                <ShiftCard key={shift.id} shift={shift} />
              ))}
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>
              No upcoming shifts scheduled
            </div>
          )}
        </div>

        {/* Streaks */}
        <div>
          <h2 style={{ marginBottom: 16, fontSize: 20, fontWeight: 600 }}>
            Current Streaks
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            <StreakCard
              label="On-Time Streak"
              value={streaks?.onTime || 0}
              icon="⏰"
            />
            <StreakCard
              label="No Callouts"
              value={streaks?.noCallouts || 0}
              icon="🟢"
            />
            <StreakCard
              label="Attendance"
              value={streaks?.attendance || 0}
              icon="📅"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function StatCard({ title, value, subtitle, icon }) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: "rgba(15, 23, 42, 0.5)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, opacity: 0.5 }}>{subtitle}</div>
    </div>
  );
}

function CircularProgress({ label, value, color, inverse = false }) {
  const percentage = Math.min(100, Math.max(0, value));
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: "rgba(15, 23, 42, 0.5)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        textAlign: "center",
      }}
    >
      <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto 12px" }}>
        <svg width="100" height="100" style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="rgba(148, 163, 184, 0.2)"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            fontSize: 20,
            fontWeight: 700,
            color: color,
          }}
        >
          {percentage.toFixed(0)}%
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
      {inverse && (
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
          (Lower is better)
        </div>
      )}
    </div>
  );
}

function EarningsCard({ title, hours }) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: "rgba(15, 23, 42, 0.5)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
      }}
    >
      <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
        {hours.toFixed(1)}
      </div>
      <div style={{ fontSize: 12, opacity: 0.5 }}>hours</div>
    </div>
  );
}

function BadgeCard({ badge, earned }) {
  if (earned) {
    return (
      <div
        style={{
          padding: 16,
          borderRadius: 12,
          background: "rgba(15, 23, 42, 0.5)",
          border: "2px solid rgba(34, 197, 94, 0.3)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 8 }}>{badge.icon}</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          {badge.name}
        </div>
        <div style={{ fontSize: 11, opacity: 0.6 }}>{badge.description}</div>
      </div>
    );
  }

  const progress = (badge.progress / badge.target) * 100;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: "rgba(15, 23, 42, 0.5)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        {badge.name}
      </div>
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "rgba(148, 163, 184, 0.2)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
              transition: "width 0.3s",
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        {badge.progress} / {badge.target}
      </div>
    </div>
  );
}

function ShiftCard({ shift }) {
  const shiftDate = shift.shift_date ? new Date(shift.shift_date) : null;
  const dateStr = shiftDate
    ? shiftDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "TBD";

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: "rgba(15, 23, 42, 0.5)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
            {dateStr}
          </div>
          <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 2 }}>
            {shift.shift_start} - {shift.shift_end}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>{shift.location}</div>
        </div>
        <div>
          <span
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              background:
                shift.status === "OPEN"
                  ? "rgba(34, 197, 94, 0.2)"
                  : "rgba(59, 130, 246, 0.2)",
              color: shift.status === "OPEN" ? "#22c55e" : "#3b82f6",
            }}
          >
            {shift.status}
          </span>
        </div>
      </div>
      {/* Weather, Traffic & Transit Alerts */}
      <ShiftAlerts shiftId={shift.id} shift={shift} />
    </div>
  );
}

function StreakCard({ label, value, icon }) {
  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: "rgba(15, 23, 42, 0.5)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 14, opacity: 0.7 }}>{label}</div>
    </div>
  );
}
