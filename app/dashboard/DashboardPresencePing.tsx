"use client";

import { useEffect } from "react";

/** Mantém `lastPresenceAt` atualizado enquanto o usuário navega no dashboard. */
export default function DashboardPresencePing() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    function ping() {
      void fetch("/api/presence/ping", { method: "POST", cache: "no-store" });
    }
    ping();
    const t = window.setInterval(ping, 60_000);
    return () => {
      window.clearInterval(t);
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);
  return null;
}
