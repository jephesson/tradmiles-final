"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { SESSION_IDLE_MS } from "@/lib/session-idle";

const TZ = "America/Recife";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatRemaining(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

function RecifeParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { hour: num("hour"), minute: num("minute"), second: num("second") };
}

function AnalogClock({ now }: { now: Date }) {
  const { hour, minute, second } = RecifeParts(now);
  const h = ((hour % 12) + minute / 60) * 30;
  const m = (minute + second / 60) * 6;
  const s = second * 6;
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
      <circle cx="20" cy="20" r="18.5" fill="#0c2340" />
      <circle cx="20" cy="20" r="16.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="0.8" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
        const a = (i * 30 * Math.PI) / 180;
        const x1 = 20 + Math.sin(a) * 13.2;
        const y1 = 20 - Math.cos(a) * 13.2;
        const x2 = 20 + Math.sin(a) * 15.4;
        const y2 = 20 - Math.cos(a) * 15.4;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0c2340" strokeWidth={i % 3 === 0 ? 1.4 : 0.7} />;
      })}
      <line x1="20" y1="20" x2="20" y2="10.5" stroke="#0c2340" strokeWidth="2" strokeLinecap="round" transform={`rotate(${h} 20 20)`} />
      <line x1="20" y1="20" x2="20" y2="8.2" stroke="#0369a1" strokeWidth="1.4" strokeLinecap="round" transform={`rotate(${m} 20 20)`} />
      <line x1="20" y1="20" x2="20" y2="7.2" stroke="#e11d48" strokeWidth="0.8" strokeLinecap="round" transform={`rotate(${s} 20 20)`} />
      <circle cx="20" cy="20" r="1.4" fill="#0c2340" />
    </svg>
  );
}

export default function SessionIdleClock() {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [remainingMs, setRemainingMs] = useState(SESSION_IDLE_MS);

  useEffect(() => {
    let lastActivity = Date.now();
    let lastPing = 0;
    let lastUi = 0;
    let loggingOut = false;

    function remaining() {
      return SESSION_IDLE_MS - (Date.now() - lastActivity);
    }

    async function ping() {
      const t = Date.now();
      if (t - lastPing < 15_000) return;
      lastPing = t;
      try {
        const res = await fetch("/api/auth/touch", { method: "POST", credentials: "include", cache: "no-store" });
        if (res.status === 401) {
          await expire();
        }
      } catch {
        /* rede: o relógio local ainda encerra */
      }
    }

    async function expire() {
      if (loggingOut) return;
      loggingOut = true;
      await signOut();
      router.replace("/login?reason=idle");
    }

    function onActivity() {
      lastActivity = Date.now();
      const t = Date.now();
      if (t - lastUi > 1000) {
        lastUi = t;
        setRemainingMs(SESSION_IDLE_MS);
      }
      void ping();
    }

    const tick = window.setInterval(() => {
      const left = remaining();
      setNow(new Date());
      setRemainingMs(left);
      if (left <= 0) void expire();
    }, 1000);

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart"];
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    const vis = () => {
      if (document.visibilityState === "visible") onActivity();
    };
    document.addEventListener("visibilitychange", vis);
    void ping();

    return () => {
      window.clearInterval(tick);
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener("visibilitychange", vis);
    };
  }, [router]);

  const { hour, minute } = RecifeParts(now);
  const warn = remainingMs <= 10 * 60 * 1000;
  const danger = remainingMs <= 2 * 60 * 1000;

  return (
    <div
      className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200/80"
      title="Sessão encerra após 1 hora sem movimento. Qualquer clique ou tecla reinicia o tempo."
    >
      <AnalogClock now={now} />
      <div className="min-w-[4.5rem] leading-tight">
        <div className="text-[11px] font-semibold tabular-nums text-slate-800">
          {pad(hour)}:{pad(minute)}
        </div>
        <div
          className={
            danger
              ? "text-[10px] font-bold tabular-nums text-rose-600"
              : warn
              ? "text-[10px] font-semibold tabular-nums text-amber-700"
              : "text-[10px] font-medium tabular-nums text-slate-500"
          }
        >
          {formatRemaining(remainingMs)}
        </div>
      </div>
    </div>
  );
}
