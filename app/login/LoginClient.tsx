"use client";

import { WELCOME_INTRO_KEY } from "@/components/WelcomeIntro";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Instagram, Loader2, Lock, MessageCircle, ShieldCheck, User } from "lucide-react";
import { signIn, loadTotpSetup, finishTotp } from "@/lib/auth";

export default function LoginClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(
    params.get("reason") === "idle"
      ? "Sessão encerrada após 1 hora sem atividade. Entre de novo."
      : null
  );
  const [step, setStep] = useState<"password" | "setup" | "verify">("password");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [manualSecret, setManualSecret] = useState("");

  const next = useMemo(() => {
    const raw = params.get("next");
    return raw && raw.startsWith("/dashboard") ? raw : "/dashboard";
  }, [params]);

  async function goHome(home: string) {
    const dest = home !== "/dashboard" && next === "/dashboard" ? home : next;
    try {
      sessionStorage.setItem(WELCOME_INTRO_KEY, "1");
    } catch {
      /* sem storage: entra sem a abertura */
    }
    router.replace(dest);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      if (step === "setup") {
        const result = await finishTotp("enable", code);
        if (!result.ok) {
          setErr(result.error);
          return;
        }
        await goHome(result.home);
        return;
      }
      if (step === "verify") {
        const result = await finishTotp("verify", code);
        if (!result.ok) {
          setErr(result.error);
          return;
        }
        await goHome(result.home);
        return;
      }

      const result = await signIn({ login, password });
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      if ("totp" in result) {
        if (result.totp === "setup") {
          const setup = await loadTotpSetup();
          if (!setup.ok) {
            setErr(setup.error);
            return;
          }
          setQr(setup.qrDataUrl);
          setManualSecret(setup.secret);
          setStep("setup");
          return;
        }
        setStep("verify");
        return;
      }

      await goHome(result.home);
    } catch {
      setErr("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const subtitle =
    params.get("reason") === "idle"
      ? "Sessão encerrada por 1 hora sem uso"
      : step === "setup"
      ? "Cadastre o Google Authenticator"
      : step === "verify"
      ? "Digite o código do Authenticator"
      : "Entre com suas credenciais";

  const fieldBox =
    "group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 transition focus-within:border-sky-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-sky-400/15";

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 font-sans">
      {/* Fundo: degradê escuro com brilhos (mesmo estilo da página inicial). */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950" />
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-sky-500/25 blur-3xl" />
        <div className="absolute -bottom-48 right-[-8rem] h-[36rem] w-[36rem] rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-cyan-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:px-10">
        {/* Lado da marca */}
        <section className="tm-rise hidden text-white lg:block">
          <div className="inline-flex items-center gap-3 rounded-full bg-white/10 py-1.5 pl-1.5 pr-4 ring-1 ring-white/15 backdrop-blur">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white">
              <Image src="/trademiles.png" alt="" width={36} height={36} unoptimized className="h-7 w-7 object-contain" />
            </span>
            <span className="text-sm font-semibold tracking-tight">TradeMiles · Vias Aéreas</span>
          </div>

          <h2 className="mt-8 text-4xl font-bold leading-[1.1] tracking-tight">
            Milhas, emissões e caixa
            <span className="block bg-gradient-to-r from-sky-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
              num só painel.
            </span>
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">
            Compras, vendas, cedentes, agenda da equipe e metas do mês em tempo real.
          </p>

          {/* Rota animada */}
          <div className="relative mt-10 h-40 max-w-lg">
            <svg viewBox="0 0 480 160" className="h-full w-full" fill="none" aria-hidden>
              <path
                id="tm-login-route"
                d="M20 130 C 140 20, 300 20, 460 110"
                stroke="url(#tm-route-grad)"
                strokeWidth="2.5"
                strokeDasharray="6 8"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="tm-route-grad" x1="0" y1="0" x2="480" y2="0" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#38bdf8" />
                  <stop offset="1" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
              <circle cx="20" cy="130" r="6" fill="#38bdf8" />
              <circle cx="20" cy="130" r="12" fill="#38bdf8" opacity="0.25" />
              <circle cx="460" cy="110" r="6" fill="#a78bfa" />
              <circle cx="460" cy="110" r="12" fill="#a78bfa" opacity="0.25" />
              <g>
                <path
                  d="M0 -7 L4 -2 L13 -1 L13 1 L4 2 L0 7 L-2 7 L0 2 L-6 1.5 L-8 4 L-10 4 L-9 0 L-10 -4 L-8 -4 L-6 -1.5 L0 -2 L-2 -7 Z"
                  fill="white"
                >
                  <animateMotion dur="6s" repeatCount="indefinite" rotate="auto">
                    <mpath href="#tm-login-route" />
                  </animateMotion>
                </path>
              </g>
              <text x="20" y="155" fill="#94a3b8" fontSize="11" fontWeight="600">REC</text>
              <text x="446" y="140" fill="#94a3b8" fontSize="11" fontWeight="600">GRU</text>
            </svg>
          </div>

          <div className="mt-8 grid max-w-lg grid-cols-3 gap-3">
            {[
              { k: "LATAM", c: "from-rose-400/20 to-rose-500/5" },
              { k: "Smiles", c: "from-amber-400/20 to-amber-500/5" },
              { k: "Livelo", c: "from-pink-400/20 to-fuchsia-500/5" },
            ].map((x) => (
              <div
                key={x.k}
                className={`rounded-2xl bg-gradient-to-br ${x.c} px-4 py-3 text-sm font-semibold text-white/90 ring-1 ring-white/10`}
              >
                {x.k}
              </div>
            ))}
          </div>
        </section>

        {/* Formulário */}
        <div className="tm-rise mx-auto w-full max-w-[440px]" style={{ animationDelay: "0.08s" }}>
          <form
            onSubmit={onSubmit}
            className="overflow-hidden rounded-[28px] bg-white shadow-[0_30px_80px_-20px_rgba(2,6,23,0.6)] ring-1 ring-white/20"
          >
            <div className="h-1.5 bg-gradient-to-r from-sky-500 via-cyan-400 to-violet-500" />
            <div className="space-y-6 px-7 pb-7 pt-8 sm:px-9">
              <header>
                <div className="flex items-center gap-3">
                  <Image
                    src="/trademiles.png"
                    alt=""
                    width={56}
                    height={56}
                    unoptimized
                    className="h-12 w-12 shrink-0 object-contain"
                  />
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-600">TradeMiles</div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">
                      {step === "password" ? "Bem-vindo de volta" : "Verificação em 2 etapas"}
                    </h1>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">{subtitle}</p>
              </header>

              <div className="space-y-3">
                {step === "password" ? (
                  <>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">Login</span>
                      <div className={fieldBox}>
                        <User className="h-[18px] w-[18px] shrink-0 text-slate-400 group-focus-within:text-sky-500" strokeWidth={1.75} aria-hidden />
                        <input
                          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                          placeholder="seu.login"
                          value={login}
                          onChange={(e) => setLogin(e.target.value)}
                          autoComplete="username"
                          autoFocus
                        />
                      </div>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">Senha</span>
                      <div className={fieldBox}>
                        <Lock className="h-[18px] w-[18px] shrink-0 text-slate-400 group-focus-within:text-sky-500" strokeWidth={1.75} aria-hidden />
                        <input
                          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                          placeholder="••••••••"
                          type={showPwd ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPwd((v) => !v)}
                          className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                          aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
                        >
                          {showPwd ? (
                            <EyeOff className="h-4 w-4" strokeWidth={2} aria-hidden />
                          ) : (
                            <Eye className="h-4 w-4" strokeWidth={2} aria-hidden />
                          )}
                        </button>
                      </div>
                    </label>
                  </>
                ) : step === "setup" ? (
                  <div className="space-y-3 text-center">
                    <p className="text-sm text-slate-600">
                      Abra o <strong>Google Authenticator</strong>, adicione uma conta e aponte para o QR. Depois digite o código de 6 dígitos.
                    </p>
                    {qr ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qr} alt="QR do Authenticator" className="mx-auto h-44 w-44 rounded-2xl border border-slate-200 p-2" />
                    ) : null}
                    <p className="break-all text-[11px] text-slate-500">
                      Ou digite a chave: <span className="font-mono text-slate-800">{manualSecret}</span>
                    </p>
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-400/15"
                      placeholder="000000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-100">
                      <ShieldCheck className="h-5 w-5 shrink-0 text-sky-600" aria-hidden />
                      Abra o Google Authenticator e digite o código de 6 dígitos.
                    </div>
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-400/15"
                      placeholder="000000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>
                )}

                {err && (
                  <p className="rounded-2xl bg-rose-50 px-3 py-2.5 text-center text-xs font-medium text-rose-700 ring-1 ring-rose-100">
                    {err}
                  </p>
                )}

                <button
                  type="submit"
                  className="group relative mt-2 flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-sky-900 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/25 outline-none transition hover:shadow-xl hover:shadow-sky-900/30 focus-visible:ring-4 focus-visible:ring-sky-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/vias-aereas-enter-icon.png"
                      alt=""
                      width={32}
                      height={32}
                      className="h-7 w-7 shrink-0 object-contain"
                      aria-hidden
                    />
                  )}
                  <span>
                    {loading
                      ? "Entrando…"
                      : step === "setup"
                      ? "Confirmar e entrar"
                      : step === "verify"
                      ? "Validar código"
                      : "Entrar no painel"}
                  </span>
                  {!loading ? (
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
                  ) : null}
                </button>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-7 py-4 text-[11px] text-slate-500 sm:px-9">
              <div>
                <p>Grupo Vias Aéreas LTDA</p>
                <p className="text-slate-400">CNPJ 63.817.773/0001-85</p>
              </div>
              <a
                href="/parceiros"
                className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 ring-1 ring-slate-200 hover:ring-sky-300"
              >
                Área de parceiros <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            </footer>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <a
              href="https://instagram.com/viasaereastrip"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/90 ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15"
              aria-label="Instagram @viasaereastrip"
            >
              <Instagram className="h-4 w-4 text-pink-300" strokeWidth={2} />
              <span>@viasaereastrip</span>
            </a>
            <a
              href="https://wa.me/5553999760707"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/90 ring-1 ring-white/15 backdrop-blur transition hover:bg-white/15"
              aria-label="WhatsApp (53) 99976-0707"
            >
              <MessageCircle className="h-4 w-4 text-emerald-300" strokeWidth={2} />
              <span>WhatsApp</span>
            </a>
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            Desenvolvido por <strong className="font-semibold text-slate-200">Dr. Jephesson Santos</strong>
          </p>
        </div>
      </div>
    </main>
  );
}
