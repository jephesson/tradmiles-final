"use client";

import { useEffect, useId, useState } from "react";
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

function AnalogClock({
  now,
  remainingRatio,
  tone,
}: {
  now: Date;
  remainingRatio: number;
  tone: "ok" | "warn" | "danger";
}) {
  const uid = useId().replace(/:/g, "");
  const { hour, minute, second } = RecifeParts(now);
  const h = ((hour % 12) + minute / 60) * 30;
  const m = (minute + second / 60) * 6;
  const s = second * 6;
  const r = 17.4;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, remainingRatio)) * circ;
  const ring =
    tone === "danger" ? "#fb7185" : tone === "warn" ? "#fbbf24" : "#7dd3fc";

  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0 drop-shadow-sm" aria-hidden>
      <defs>
        <linearGradient id={`tm-face-${uid}`} x1="8" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1e4a78" />
          <stop offset="55%" stopColor="#0c2340" />
          <stop offset="100%" stopColor="#061525" />
        </linearGradient>
        <radialGradient id={`tm-sheen-${uid}`} cx="32%" cy="28%" r="70%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      <circle cx="20" cy="20" r="19.2" fill="rgba(255,255,255,0.08)" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="2.1"
      />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={ring}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform="rotate(-90 20 20)"
      />
      <circle cx="20" cy="20" r="14.8" fill={`url(#tm-face-${uid})`} />
      <circle cx="20" cy="20" r="14.8" fill={`url(#tm-sheen-${uid})`} />

      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
        const a = (i * 30 * Math.PI) / 180;
        const major = i % 3 === 0;
        const inner = major ? 11.2 : 12.4;
        const outer = 13.6;
        return (
          <line
            key={i}
            x1={20 + Math.sin(a) * inner}
            y1={20 - Math.cos(a) * inner}
            x2={20 + Math.sin(a) * outer}
            y2={20 - Math.cos(a) * outer}
            stroke={major ? "rgba(186,230,253,0.95)" : "rgba(255,255,255,0.28)"}
            strokeWidth={major ? 1.35 : 0.7}
            strokeLinecap="round"
          />
        );
      })}

      <line
        x1="20"
        y1="20"
        x2="20"
        y2="11.4"
        stroke="rgba(248,250,252,0.95)"
        strokeWidth="1.85"
        strokeLinecap="round"
        transform={`rotate(${h} 20 20)`}
      />
      <line
        x1="20"
        y1="20"
        x2="20"
        y2="8.6"
        stroke="#e0f2fe"
        strokeWidth="1.25"
        strokeLinecap="round"
        transform={`rotate(${m} 20 20)`}
      />
      <line
        x1="20"
        y1="21.6"
        x2="20"
        y2="7.4"
        stroke={ring}
        strokeWidth="0.7"
        strokeLinecap="round"
        transform={`rotate(${s} 20 20)`}
      />
      <circle cx="20" cy="20" r="1.55" fill="#f8fafc" />
      <circle cx="20" cy="20" r="0.7" fill={ring} />
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
  const tone = danger ? "danger" : warn ? "warn" : "ok";

  return (
    <div
      className="flex shrink-0 items-center gap-2.5 rounded-2xl bg-white/10 px-2 py-1 ring-1 ring-white/15"
      title="Horário de Recife. A sessão encerra após 1 hora sem movimento; qualquer clique ou tecla reinicia o tempo."
    >
      <AnalogClock
        now={now}
        remainingRatio={remainingMs / SESSION_IDLE_MS}
        tone={tone}
      />
      <div className="min-w-[4.6rem] leading-tight">
        <div className="text-[13px] font-semibold tabular-nums tracking-wide text-white">
          {pad(hour)}:{pad(minute)}
        </div>
        <div
          className={
            danger
              ? "text-[10px] font-bold tabular-nums text-rose-300"
              : warn
                ? "text-[10px] font-semibold tabular-nums text-amber-300"
                : "text-[10px] font-medium tabular-nums text-sky-200/80"
          }
        >
          {formatRemaining(remainingMs)}
        </div>
      </div>
    </div>
  );
}
