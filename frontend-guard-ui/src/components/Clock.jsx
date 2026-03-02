import React, { useState, useEffect } from "react";

export default function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        marginRight: 16,
        padding: "8px 12px",
        background: "rgba(255, 255, 255, 0.1)",
        borderRadius: 8,
        border: "1px solid rgba(255, 255, 255, 0.2)",
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "#fff",
          fontFamily: "monospace",
          letterSpacing: 1,
        }}
      >
        {formatTime(time)}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "rgba(255, 255, 255, 0.8)",
          marginTop: 2,
        }}
      >
        {formatDate(time)}
      </div>
    </div>
  );
}
