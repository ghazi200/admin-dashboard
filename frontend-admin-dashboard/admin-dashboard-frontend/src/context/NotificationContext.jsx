import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import socketManager from "../realtime/socketManager";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
} from "../services/notifications";

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const mounted = useRef(true);

  const isReportsOrInspections =
    (location.pathname || "").toLowerCase().includes("/reports") ||
    (location.pathname || "").toLowerCase().includes("/inspections");

  // initial load — skip on Reports/Inspections to avoid 401 that could affect page
  useEffect(() => {
    if (isReportsOrInspections) return;
    mounted.current = true;

    (async () => {
      try {
        const [listRes, countRes] = await Promise.all([
          fetchNotifications(25),
          fetchUnreadCount(),
        ]);

        if (!mounted.current) return;

        const list = Array.isArray(listRes.data) ? listRes.data : (listRes.data?.notifications || []);
        const count =
          typeof countRes.data?.unread === "number"
            ? countRes.data.unread
            : typeof countRes.data?.unreadCount === "number"
            ? countRes.data.unreadCount
            : 0;

        setItems(list);
        setUnread(count);
      } catch (e) {
        const msg = e?.message || "";
        const isTimeout = e?.code === "ECONNABORTED" || /timeout/i.test(msg);
        const isNetwork = msg === "Network Error" || !e?.response;
        if (isTimeout || isNetwork) {
          console.warn(
            "Notifications initial load failed: backend may be down or slow.",
            msg
          );
        } else {
          console.warn("Notifications initial load failed:", msg);
        }
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [isReportsOrInspections]);

  // Subscribe via Socket Manager (safe on/off; no disconnect on unmount)
  useEffect(() => {
    if (isReportsOrInspections) return;

    const socket = socketManager.connect();
    if (!socket) return;

    const onConnect = () => {
      if (mounted.current) setIsConnected(true);
    };
    const onDisconnect = () => {
      if (mounted.current) setIsConnected(false);
    };
    const onNew = (n) => {
      if (!mounted.current) return;
      setItems((prev) => [n, ...prev].slice(0, 50));
      setUnread((u) => u + 1);
    };

    setIsConnected(socketManager.isConnected());
    socketManager.on("connect", onConnect);
    socketManager.on("disconnect", onDisconnect);
    socketManager.on("notification:new", onNew);

    return () => {
      socketManager.off("connect", onConnect);
      socketManager.off("disconnect", onDisconnect);
      socketManager.off("notification:new", onNew);
    };
  }, [isReportsOrInspections]);

  const markRead = async (id) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(u - 1, 0));

    try {
      await markNotificationRead(id);
    } catch (e) {
      console.warn("markNotificationRead failed:", e?.message);
    }
  };

  const value = useMemo(
    () => ({ items, unread, markRead, isConnected }),
    [items, unread, isConnected]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
