"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Instagram, MessageCircle } from "lucide-react";

export default function LoginClient() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [revealLogin, setRevealLogin] = useState(false);

  const params = useSearchParams();

  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealLogin(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const router = useRouter();

  const next = useMemo(() => {
    const raw = params.get("next");
    return raw && raw.startsWith("/dashboard") ? raw : "/dashboard";
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", login, password }),
      });

      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json?.ok) {
        setErr(json?.error || "Login ou senha inválidos");
        return;
      }

      router.replace(next);
    } catch {
      setErr("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-sky-50/40 to-blue-100/50 font-sans">
      {/* Decoração de fundo */}
      <div
        className="pointer-events-none absolute -left-32 top-0 h-96 w-96 rounded-full bg-sky-200/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-blue-200/25 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-orange-100/20 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 grid min-h-screen place-items-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[440px]">
          <form
            onSubmit={onSubmit}
            className="space-y-0 overflow-hidden rounded-3xl border border-white/60 bg-white/85 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.12)] backdrop-blur-md"
          >
            {/* Entrada: boas-vindas + marca Vias Aéreas */}
            <header className="space-y-5 px-7 pb-8 pt-8 text-center sm:px-8 sm:pt-9">
              <h1 className="text-balance text-[1.35rem] font-semibold leading-snug tracking-tight text-slate-900 sm:text-2xl">
                Seja bem-vindo à gestão do grupo{" "}
                <span className="whitespace-nowrap text-slate-800">Vias Aéreas</span>
              </h1>
              <div className="flex justify-center px-2">
                <Image
                  src="/vias-aereas-logo.png"
                  alt="Vias Aéreas — Conectando destinos, realizando sonhos"
                  width={260}
                  height={66}
                  priority
                  className="h-[3.25rem] w-auto max-w-[min(280px,92vw)] object-contain sm:h-14"
                />
              </div>
            </header>

            {/* Transição visual → área de login TradeMiles */}
            <div className="px-7 sm:px-8" aria-hidden>
              <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200/80 to-transparent" />
            </div>

            <div
              className={`space-y-5 px-7 pb-8 pt-7 transition-[opacity,transform] duration-500 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none sm:px-8 sm:pb-9 sm:pt-8 ${
                revealLogin ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              <div className="text-center">
                <div className="flex items-center justify-center gap-2.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-50 to-white shadow-inner ring-1 ring-slate-100">
                    <Image
                      src="/trademiles.png"
                      alt=""
                      width={32}
                      height={32}
                      className="rounded-md"
                    />
                  </span>
                  <div className="text-left">
                    <p className="text-lg font-semibold tracking-tight text-slate-900">
                      TradeMiles
                    </p>
                    <p className="text-sm text-slate-500">Entre com suas credenciais</p>
                  </div>
                </div>
              </div>

              {/* Campos */}
              <div className="space-y-3">
              <label className="block">
                <span className="sr-only">Login</span>
                <input
                  className="w-full rounded-2xl border border-slate-200/90 bg-white/90 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/25"
                  placeholder="Login"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                />
              </label>

              <label className="block">
                <span className="sr-only">Senha</span>
                <div className="flex w-full items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/90 px-4 py-2.5 shadow-sm transition focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-400/25">
                  <input
                    className="min-w-0 flex-1 bg-transparent py-0.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    placeholder="Senha"
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="shrink-0 text-xs font-medium text-sky-700/90 hover:text-sky-900"
                  >
                    {showPwd ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </label>

              {err && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-700 ring-1 ring-red-100">
                  {err}
                </p>
              )}

              <button
                type="submit"
                className="w-full rounded-2xl bg-gradient-to-r from-[#0c2340] to-[#143a5c] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-slate-900/15 outline-none transition hover:from-[#0f2d52] hover:to-[#1a4870] hover:shadow-lg hover:shadow-slate-900/20 focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                disabled={loading}
              >
                {loading ? "Entrando…" : "Entrar"}
              </button>
              </div>
            </div>

            <footer className="space-y-1 border-t border-slate-100/90 bg-slate-50/40 px-7 py-4 text-center text-[11px] leading-relaxed text-slate-500 sm:px-8">
              <p>TradeMiles — uma empresa do grupo Vias Aéreas LTDA</p>
              <p className="text-slate-400">CNPJ: 63.817.773/0001-85</p>
            </footer>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <a
              href="https://instagram.com/viasaereastrip"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition hover:border-sky-200/80 hover:bg-white hover:text-slate-900"
              aria-label="Instagram @viasaereastrip"
            >
              <Instagram className="h-[18px] w-[18px] text-pink-600" strokeWidth={2} />
              <span>@viasaereastrip</span>
            </a>

            <a
              href="https://wa.me/5553999760707"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition hover:border-emerald-200/80 hover:bg-white hover:text-slate-900"
              aria-label="WhatsApp (53) 99976-0707"
            >
              <MessageCircle className="h-[18px] w-[18px] text-emerald-600" strokeWidth={2} />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
