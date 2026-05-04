"use client";

import { useEffect } from "react";

/** Mantém `lastPresenceAt` atualizado enquanto o usuário navega no dashboard. */
export default function DashboardPresencePing() {
  useEffect(() => {
    function ping() {
      void fetch("/api/presence/ping", { method: "POST", cache: "no-store" });
    }
    ping();
    const t = window.setInterval(ping, 60_000);
    return () => window.clearInterval(t);
  }, []);
  return null;
}
