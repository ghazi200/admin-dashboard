import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { connectSocket, isSocketConnected } from "../realtime/socket";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/notifications";

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const mounted = useRef(true);

  const isReportsOrInspections = useMemo(() => {
    const path = (location.pathname || "").toLowerCase();
    return path.includes("/reports") || path.includes("/inspections");
  }, [location.pathname]);

  useEffect(() => {
    mounted.current = true;
    const checkConnection = () => {
      if (mounted.current) setIsConnected(isSocketConnected());
    };
    checkConnection();
    const interval = setInterval(checkConnection, 2000);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (isReportsOrInspections) return;
    let isMounted = true;

    const loadNotifications = async () => {
      try {
        const [listRes, countRes] = await Promise.allSettled([
          fetchNotifications(25),
          fetchUnreadCount(),
        ]);

        if (!isMounted) return;

        if (listRes.status === "fulfilled" && listRes.value) {
          const list = Array.isArray(listRes.value.data)
            ? listRes.value.data
            : (listRes.value.data?.notifications || []);
          setItems(list);
        }

        if (countRes.status === "fulfilled" && countRes.value) {
          const count =
            typeof countRes.value.data?.unread === "number"
              ? countRes.value.data.unread
              : typeof countRes.value.data?.unreadCount === "number"
              ? countRes.value.data.unreadCount
              : 0;
          setUnread(count);
        }
      } catch (e) {
        const msg = e?.message || "";
        const isTimeout = e?.code === "ECONNABORTED" || /timeout/i.test(msg);
        const isNetwork = msg === "Network Error" || !e?.response;
        if (isTimeout || isNetwork) {
          console.warn("⚠️ Notifications initial load failed: backend may be down or slow.", msg);
        } else {
          console.warn("⚠️ Notifications initial load failed:", msg);
        }
      }
    };

    loadNotifications();
    return () => {
      isMounted = false;
    };
  }, [isReportsOrInspections]);

  useEffect(() => {
    if (isReportsOrInspections) return;

    let s;
    try {
      s = connectSocket();
    } catch (err) {
      console.error("❌ Failed to connect socket:", err);
      return;
    }

    if (!s) return;

    setIsConnected(s.connected);

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

    try {
      s.on("connect", onConnect);
      s.on("disconnect", onDisconnect);
      s.on("notification:new", onNew);
    } catch (err) {
      console.error("❌ Failed to attach socket listeners:", err);
      return;
    }

    return () => {
      try {
        if (s) {
          s.off("connect", onConnect);
          s.off("disconnect", onDisconnect);
          s.off("notification:new", onNew);
        }
      } catch (_) {}
    };
  }, [isReportsOrInspections]);

  const markRead = useCallback(async (id) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(u - 1, 0));
    try {
      await markNotificationRead(id);
    } catch (e) {
      console.warn("⚠️ markNotificationRead failed:", e?.message);
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, read: false } : x)));
      setUnread((u) => u + 1);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const currentUnread = unread;
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch (e) {
      console.warn("⚠️ markAllNotificationsRead failed:", e?.message);
      setItems((prev) => prev.map((x) => ({ ...x, read: false })));
      setUnread(currentUnread);
    }
  }, [unread]);

  const refresh = useCallback(() => {
    if (isReportsOrInspections) return;
    fetchNotifications(25).then((res) => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.notifications || []);
      setItems(list);
    }).catch(() => {});
    fetchUnreadCount().then((res) => {
      const count = typeof res.data?.unread === "number" ? res.data.unread : (res.data?.unreadCount ?? 0);
      setUnread(count);
    }).catch(() => {});
  }, [isReportsOrInspections]);

  const value = useMemo(
    () => ({ items, unread, isConnected, markRead, markAllRead, refresh }),
    [items, unread, isConnected, markRead, markAllRead, refresh]
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
