import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { connectSocket } from "../realtime/socket";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
} from "../services/notifications";

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  // initial load
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [listRes, countRes] = await Promise.all([
          fetchNotifications(25),
          fetchUnreadCount(),
        ]);

        if (!mounted) return;

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
      mounted = false;
    };
  }, []);

  // realtime (socket optional — Reports/Inspections work without it)
  useEffect(() => {
    let s;
    try {
      s = connectSocket();
    } catch (_) {
      return;
    }
    if (!s) return;

    const onNew = (n) => {
      setItems((prev) => [n, ...prev].slice(0, 50));
      setUnread((u) => u + 1);
    };

    try {
      s.on("notification:new", onNew);
    } catch (_) {
      return;
    }

    return () => {
      try {
        if (s) s.off("notification:new", onNew);
      } catch (_) {}
    };
  }, []);

  const markRead = async (id) => {
    // optimistic
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(u - 1, 0));

    try {
      await markNotificationRead(id);
    } catch (e) {
      console.warn("markNotificationRead failed:", e?.message);
      // keep simple: no rollback
    }
  };

  const value = useMemo(() => ({ items, unread, markRead }), [items, unread]);

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
