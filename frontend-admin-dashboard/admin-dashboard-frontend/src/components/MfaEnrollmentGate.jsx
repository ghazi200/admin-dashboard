import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "../services/api";

/**
 * When MFA is required by policy but not enabled, force Account page.
 */
export default function MfaEnrollmentGate({ children }) {
  const location = useLocation();
  const onAccount = location.pathname === "/account" || location.pathname.startsWith("/account/");

  const { data: me, isLoading, isError } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await getMe();
      return res.data;
    },
    staleTime: 30 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (me) {
      try {
        localStorage.setItem("adminUser", JSON.stringify(me));
        localStorage.setItem("adminInfo", JSON.stringify(me));
      } catch {
        /* ignore */
      }
    }
  }, [me]);

  if (isLoading) return children;
  if (isError) return children;

  const needsSetup = !!(me?.mfa_required && !me?.mfa_enabled);
  if (needsSetup && !onAccount) {
    return <Navigate to="/account" replace state={{ mfaSetupRequired: true }} />;
  }

  return children;
}
