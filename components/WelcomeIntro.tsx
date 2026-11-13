"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getSession } from "@/lib/auth";

/** Marca feita no login: a abertura só aparece logo depois de entrar. */
export const WELCOME_INTRO_KEY = "tm:welcome-intro";

const PHRASES: { title: string; sub: string }[] = [
  {
    title: "Hoje a gente coloca pessoas no ar.",
    sub: "Cada emissão é alguém indo encontrar quem ama.",
  },
  {
    title: "Por trás de cada localizador, uma história.",
    sub: "Um reencontro, uma viagem sonhada, um recomeço. A gente faz acontecer.",
  },
  {
    title: "Fazer voar é o nosso trabalho.",
    sub: "Milhas viram abraços, férias e primeiras vezes no avião.",
  },
  {
    title: "Tem gente esperando no portão de embarque.",
    sub: "Cada venda bem feita leva alguém mais longe.",
  },
];


function firstName(name?: string | null) {
  const n = String(name || "").trim().split(/\s+/)[0] || "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : "";
}

export default function WelcomeIntro() {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [phrase, setPhrase] = useState(PHRASES[0]);
  const [name, setName] = useState("");

  useEffect(() => {
    // A marca só é apagada quando a pessoa clica em seguir; se o dashboard remontar, a abertura continua.
    let flag = false;
    try {
      const raw = sessionStorage.getItem(WELCOME_INTRO_KEY);
      const at = Number(raw);
      // "1" (versão antiga) ou horário do login nos últimos 30 min.
      flag = raw === "1" || (Number.isFinite(at) && at > 0 && Date.now() - at < 30 * 60_000);
      if (raw && !flag) sessionStorage.removeItem(WELCOME_INTRO_KEY);
    } catch {
      flag = false;
    }
    if (!flag) return;
    const t0 = window.setTimeout(() => {
      setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
      setName(firstName(getSession()?.name));
      setShow(true);
    }, 0);
    return () => {
      window.clearTimeout(t0);
    };
  }, []);

  const skip = useCallback(() => {
    try {
      sessionStorage.removeItem(WELCOME_INTRO_KEY);
    } catch {
      /* ignore */
    }
    setLeaving(true);
    window.setTimeout(() => setShow(false), 450);
  }, []);

  useEffect(() => {
    if (!show) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, skip]);

  if (!show) return null;

  return (
    <div
      className={`tm-intro fixed inset-0 z-[1000] flex items-center justify-center overflow-hidden bg-[#050b1a] text-white ${
        leaving ? "tm-intro-leave" : ""
      }`}
      role="dialog"
      aria-label="Boas-vindas"
    >
      <style>{CSS}</style>

      {/* céu */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(56,189,248,0.35),transparent_60%),radial-gradient(ellipse_at_10%_0%,rgba(139,92,246,0.35),transparent_55%),radial-gradient(ellipse_at_90%_10%,rgba(236,72,153,0.25),transparent_50%)]" />
      <div className="tm-intro-stars pointer-events-none absolute inset-0" />
      <div className="tm-intro-horizon pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-sky-500/20 to-transparent" />

      {/* rota + avião */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="tmTrail" x1="0" x2="1">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0" />
            <stop offset="0.6" stopColor="#38bdf8" stopOpacity="0.8" />
            <stop offset="1" stopColor="#f0abfc" stopOpacity="1" />
          </linearGradient>
        </defs>
        <path
          id="tmRoute"
          className="tm-intro-route"
          d="M -60 640 C 260 520, 420 260, 700 300 S 1080 180, 1280 90"
          fill="none"
          stroke="url(#tmTrail)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="2 14"
        />
        <circle className="tm-intro-dot" cx="-60" cy="640" r="6" fill="#38bdf8" />
        <g className="tm-intro-plane">
          <g transform="rotate(0)">
            <path
              d="M 18 0 L -10 -4 L -16 -16 L -21 -16 L -17 -3 L -27 -2 L -31 -8 L -34 -8 L -32 0 L -34 8 L -31 8 L -27 2 L -17 3 L -21 16 L -16 16 L -10 4 Z"
              fill="#fff"
            />
          </g>
          <animateMotion dur="3.2s" begin="0s" fill="freeze" rotate="auto" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.25 1">
            <mpath href="#tmRoute" />
          </animateMotion>
        </g>
      </svg>

      {/* texto */}
      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        <div className="tm-intro-l1 text-xs font-bold uppercase tracking-[0.35em] text-sky-300">
          {name ? `Bem-vindo de volta, ${name}` : "Bem-vindo de volta"}
        </div>
        <h1 className="tm-intro-l2 mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          {phrase.title}
        </h1>
        <p className="tm-intro-l3 mx-auto mt-4 max-w-xl text-base text-slate-300 sm:text-lg">{phrase.sub}</p>
        <div className="tm-intro-l4 mt-8 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-400">
          <span className="h-px w-8 bg-slate-600" />
          TradeMiles · Vias Aéreas
          <span className="h-px w-8 bg-slate-600" />
        </div>
        <div className="tm-intro-l5 mt-10">
          <button
            type="button"
            autoFocus
            onClick={skip}
            className="tm-intro-go group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-slate-900 shadow-[0_10px_40px_-10px_rgba(56,189,248,0.8)] transition hover:scale-[1.03] hover:bg-sky-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/50"
          >
            Seguir para o dashboard
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </button>
          <div className="mt-3 text-[11px] text-slate-500">ou aperte Enter</div>
        </div>
      </div>

      <div className="tm-intro-bar pointer-events-none absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r from-sky-400 via-violet-400 to-pink-400" />
    </div>
  );
}

const CSS = `

.tm-intro-leave { animation: tmIntroOut .55s ease-in forwards; }
@keyframes tmIntroOut { to { opacity: 0; transform: scale(1.04); filter: blur(4px) } }

.tm-intro-stars {
  background-image:
    radial-gradient(1.5px 1.5px at 12% 18%, #fff, transparent),
    radial-gradient(1px 1px at 28% 42%, #cbd5e1, transparent),
    radial-gradient(1.5px 1.5px at 46% 12%, #fff, transparent),
    radial-gradient(1px 1px at 63% 33%, #e2e8f0, transparent),
    radial-gradient(1.5px 1.5px at 78% 22%, #fff, transparent),
    radial-gradient(1px 1px at 88% 48%, #cbd5e1, transparent),
    radial-gradient(1px 1px at 8% 62%, #e2e8f0, transparent),
    radial-gradient(1.5px 1.5px at 35% 70%, #fff, transparent),
    radial-gradient(1px 1px at 55% 58%, #cbd5e1, transparent),
    radial-gradient(1px 1px at 92% 75%, #fff, transparent);
  animation: tmStars 3.6s ease-in-out both;
}
@keyframes tmStars { 0% { opacity: 0; transform: translateY(8px) } 40% { opacity: .9 } 100% { opacity: .6; transform: translateY(-6px) } }

.tm-intro-route { stroke-dashoffset: 0; animation: tmRoute 3.2s cubic-bezier(.45,0,.25,1) both; clip-path: inset(0 100% 0 0); }
@keyframes tmRoute { to { clip-path: inset(0 0 0 0) } }
.tm-intro-dot { animation: tmPulse 1.2s ease-out infinite; transform-origin: -60px 640px; }
@keyframes tmPulse { 0% { opacity: 1 } 100% { opacity: .2 } }
.tm-intro-plane { filter: drop-shadow(0 0 10px rgba(240,171,252,.8)); }

.tm-intro-l1, .tm-intro-l2, .tm-intro-l3, .tm-intro-l4 { opacity: 0; animation: tmUp .7s cubic-bezier(.2,.8,.2,1) forwards; }
.tm-intro-l1 { animation-delay: .25s }
.tm-intro-l2 { animation-delay: .55s }
.tm-intro-l3 { animation-delay: 1.05s }
.tm-intro-l4 { animation-delay: 1.5s }
@keyframes tmUp { from { opacity: 0; transform: translateY(14px); filter: blur(6px) } to { opacity: 1; transform: none; filter: none } }

.tm-intro-bar { animation: tmBar 2.4s cubic-bezier(.45,0,.25,1) forwards; transform-origin: left; transform: scaleX(0) }
@keyframes tmBar { to { transform: scaleX(1) } }

.tm-intro-l5 { opacity: 0; animation: tmUp .7s cubic-bezier(.2,.8,.2,1) 2s forwards; }
.tm-intro-go { position: relative; overflow: hidden; }
.tm-intro-go::after { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.55) 50%, transparent 70%); transform: translateX(-120%); animation: tmShine 2.8s 2.8s ease-in-out infinite; }
@keyframes tmShine { 0% { transform: translateX(-120%) } 45%, 100% { transform: translateX(120%) } }

@media (prefers-reduced-motion: reduce) {
  .tm-intro-route, .tm-intro-stars, .tm-intro-l1, .tm-intro-l2, .tm-intro-l3, .tm-intro-l4, .tm-intro-l5 { animation: none; opacity: 1; clip-path: none }
  .tm-intro-plane { display: none }
}
`;
