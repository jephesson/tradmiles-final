import { Plane } from "lucide-react";

/**
 * Fundo estilo “céu” com marca d’água leve (globo + rotas à esquerda,
 * trilha + avião à direita). Se quiser trocar por uma imagem só de fundo,
 * substitua por `Image` com fill ou `style={{ backgroundImage: ... }}`.
 */
export default function LoginSkyBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute inset-0 bg-[linear-gradient(168deg,#cfe8f5_0%,#f2f8fc_42%,#e5f0f9_100%)]" />

      {/* Globo pontilhado + arcos de rota */}
      <svg
        className="absolute -left-[12%] top-[8%] h-[min(85vw,26rem)] w-[min(85vw,26rem)] sm:-left-[6%] sm:top-[12%] sm:h-[28rem] sm:w-[28rem]"
        viewBox="0 0 360 360"
        fill="none"
      >
        <circle
          cx="180"
          cy="180"
          r="150"
          className="text-sky-400/45"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="2 10"
        />
        <ellipse
          cx="180"
          cy="180"
          rx="150"
          ry="52"
          className="text-sky-400/35"
          stroke="currentColor"
          strokeWidth="0.9"
          strokeDasharray="2 8"
        />
        <ellipse
          cx="180"
          cy="180"
          rx="52"
          ry="150"
          className="text-sky-400/30"
          stroke="currentColor"
          strokeWidth="0.9"
          strokeDasharray="2 8"
        />
        <path
          d="M 45 220 C 120 60 240 80 315 145"
          stroke="#f97316"
          strokeWidth="1.4"
          strokeDasharray="5 7"
          opacity="0.42"
          strokeLinecap="round"
        />
        <path
          d="M 60 260 C 150 180 230 100 300 95"
          stroke="#38bdf8"
          strokeWidth="1.2"
          strokeDasharray="4 6"
          opacity="0.45"
          strokeLinecap="round"
        />
        <circle cx="45" cy="220" r="3.5" fill="#f97316" opacity="0.5" />
        <circle cx="315" cy="145" r="3.5" fill="#38bdf8" opacity="0.55" />
        <circle cx="60" cy="260" r="2.5" fill="#38bdf8" opacity="0.45" />
        <circle cx="300" cy="95" r="2.5" fill="#f97316" opacity="0.4" />
      </svg>

      {/* Trilha pontilhada + avião */}
      <div className="absolute -right-[6%] top-[14%] h-52 w-[min(100vw,24rem)] sm:right-[2%] sm:top-[17%] sm:h-56 sm:w-96">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 400 220"
          fill="none"
        >
          <path
            d="M 20 175 C 120 40 260 30 380 100"
            className="text-slate-500/18"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeDasharray="5 7"
            strokeLinecap="round"
          />
        </svg>
        <Plane
          className="absolute right-[6%] top-[18%] h-24 w-24 -rotate-[20deg] text-slate-700/15 sm:h-28 sm:w-28"
          strokeWidth={1.15}
          aria-hidden
        />
      </div>
    </div>
  );
}
