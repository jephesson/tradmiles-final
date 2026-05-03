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
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100/80 font-sans">
      <div
        className="pointer-events-none absolute -left-24 top-[-10%] h-[28rem] w-[28rem] rounded-full bg-sky-100/50 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-[-5%] h-[22rem] w-[22rem] rounded-full bg-slate-200/40 blur-3xl"
        aria-hidden
      />

      <div className="relative z-10 grid min-h-screen place-items-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-[400px]">
          <form
            onSubmit={onSubmit}
            className="rounded-3xl border border-slate-200/60 bg-white p-7 shadow-[0_20px_40px_-15px_rgba(15,23,42,0.08)] sm:p-8"
          >
            <header className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-50 ring-1 ring-slate-100">
                <Image
                  src="/trademiles.png"
                  alt=""
                  width={36}
                  height={36}
                  priority
                  className="rounded-lg"
                />
              </div>
              <div className="min-w-0 pt-0.5">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-[1.35rem]">
                  TradeMiles
                </h1>
                <p className="mt-0.5 text-sm text-slate-500">Acesse seu painel</p>
              </div>
            </header>

            <div className="mt-8 space-y-3">
              <label className="block">
                <span className="sr-only">Login</span>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5"
                  placeholder="Login"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                />
              </label>

              <label className="block">
                <span className="sr-only">Senha</span>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 transition focus-within:border-slate-300 focus-within:ring-2 focus-within:ring-slate-900/5">
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
                    className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    {showPwd ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </label>

              {err && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-700">
                  {err}
                </p>
              )}

              <button
                type="submit"
                className="mt-1 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white outline-none transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading}
              >
                {loading ? "Entrando…" : "Entrar"}
              </button>
            </div>

            <footer className="mt-8 border-t border-slate-100 pt-5 text-center text-[11px] leading-relaxed text-slate-500">
              <p>TradeMiles — uma empresa do grupo Vias Aéreas LTDA</p>
              <p className="mt-0.5 text-slate-400">CNPJ: 63.817.773/0001-85</p>
            </footer>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
            <a
              href="https://instagram.com/viasaereastrip"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-2 text-sm text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Instagram @viasaereastrip"
            >
              <Instagram className="h-[17px] w-[17px] text-pink-600" strokeWidth={2} />
              <span>@viasaereastrip</span>
            </a>

            <a
              href="https://wa.me/5553999760707"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3.5 py-2 text-sm text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
              aria-label="WhatsApp (53) 99976-0707"
            >
              <MessageCircle className="h-[17px] w-[17px] text-emerald-600" strokeWidth={2} />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
