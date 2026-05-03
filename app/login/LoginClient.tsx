"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Instagram, Lock, MessageCircle, User } from "lucide-react";
import LoginSkyBackdrop from "./LoginSkyBackdrop";

const navy = "#0c2340";

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
    <main className="relative min-h-screen overflow-hidden font-sans">
      <LoginSkyBackdrop />

      <div className="relative z-10 grid min-h-screen place-items-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-[440px]">
          <form
            onSubmit={onSubmit}
            className="overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_24px_48px_-12px_rgba(12,35,64,0.14)] backdrop-blur-sm"
          >
            <div className="space-y-6 px-7 pb-2 pt-8 sm:px-9 sm:pt-9">
              <header className="flex flex-col items-center text-center">
                <div className="flex items-center justify-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 ring-1 ring-sky-100/80">
                    <Image
                      src="/trademiles.png"
                      alt=""
                      width={32}
                      height={32}
                      className="rounded-md"
                    />
                  </span>
                  <div className="text-left">
                    <h1 className="text-base font-semibold text-slate-900">
                      TradeMiles
                    </h1>
                    <p className="text-sm text-slate-500">
                      Entre com suas credenciais
                    </p>
                  </div>
                </div>
              </header>

              <div className="space-y-3 pt-1">
                <label className="block">
                  <span className="sr-only">Login</span>
                  <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-400/20">
                    <User
                      className="h-[18px] w-[18px] shrink-0 text-slate-400"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      placeholder="Login"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="sr-only">Senha</span>
                  <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 transition focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-400/20">
                    <Lock
                      className="h-[18px] w-[18px] shrink-0 text-slate-400"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      placeholder="Senha"
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="flex shrink-0 items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900"
                    >
                      <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      {showPwd ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
                </label>

                {err && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-700 ring-1 ring-red-100/80">
                    {err}
                  </p>
                )}

                <button
                  type="submit"
                  style={{ backgroundColor: navy }}
                  className="mt-1 flex w-full items-center justify-center gap-3 rounded-xl px-3 py-3 text-center text-sm font-semibold leading-snug text-white text-balance shadow-md shadow-slate-900/10 outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
                  disabled={loading}
                >
                  <Image
                    src="/vias-aereas-enter-icon.png"
                    alt=""
                    width={40}
                    height={40}
                    className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9"
                    aria-hidden
                  />
                  {loading ? "Entrando…" : "Entrar no painel Vias Aéreas"}
                </button>
              </div>
            </div>

            <footer className="border-t border-slate-200/80 bg-slate-50/90 px-7 py-4 text-center text-[11px] leading-relaxed text-slate-500 sm:px-9">
              <p>TradeMiles — uma empresa do grupo Vias Aéreas LTDA</p>
              <p className="mt-0.5 text-slate-400">CNPJ: 63.817.773/0001-85</p>
            </footer>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://instagram.com/viasaereastrip"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/85 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white"
              aria-label="Instagram @viasaereastrip"
            >
              <Instagram className="h-[18px] w-[18px] text-pink-600" strokeWidth={2} />
              <span>@viasaereastrip</span>
            </a>

            <a
              href="https://wa.me/5553999760707"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/85 px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white"
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
