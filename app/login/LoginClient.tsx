"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Instagram, MessageCircle } from "lucide-react";

export default function LoginClient() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const params = useSearchParams();
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
            className="space-y-5 rounded-3xl border border-white/60 bg-white/85 p-7 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.12)] backdrop-blur-md sm:p-8"
          >
            {/* Cabeçalho TradeMiles */}
            <header className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:gap-4 sm:text-left">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-white shadow-inner ring-1 ring-sky-100/80">
                <Image
                  src="/trademiles.png"
                  alt=""
                  width={40}
                  height={40}
                  priority
                  className="rounded-lg"
                />
              </div>
              <div className="mt-4 min-w-0 sm:mt-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                  TradeMiles
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Acesse seu painel de gestão
                </p>
              </div>
            </header>

            {/* Faixa do grupo Vias Aéreas — logo existente em /public */}
            <div className="rounded-2xl border border-sky-100/80 bg-gradient-to-r from-sky-50/90 via-white to-blue-50/70 px-4 py-3.5 shadow-sm ring-1 ring-slate-900/[0.03]">
              <p className="mb-2 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-slate-400">
                Ecossistema
              </p>
              <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
                <Image
                  src="/vias-aereas-logo.png"
                  alt="Vias Aéreas — Conectando destinos, realizando sonhos"
                  width={220}
                  height={56}
                  className="h-10 w-auto max-w-[min(220px,85%)] object-contain object-center sm:h-11"
                />
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

            <footer className="space-y-1 border-t border-slate-100 pt-4 text-center text-[11px] leading-relaxed text-slate-500">
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
