"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AffiliateLoginClient() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const params = useSearchParams();

  const next = useMemo(() => {
    const raw = params.get("next");
    return raw && raw.startsWith("/afiliado") ? raw : "/afiliado/dashboard";
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/afiliado/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", login, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Login ou senha inválidos.");
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 grid place-items-center p-6">
      <div className="w-[min(420px,92vw)]">
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Image
              src="/trademiles.png"
              alt="TradeMiles"
              width={38}
              height={38}
              priority
              unoptimized
              className="rounded-md"
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Portal do afiliado</h1>
              <p className="text-xs text-slate-500">Acompanhe suas indicações TradeMiles</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-black/10"
              placeholder="Login ou CPF"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
            />

            <div className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-black/10">
              <input
                className="flex-1 outline-none"
                placeholder="Senha"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                {showPwd ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            {error ? <p className="text-center text-xs text-rose-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <div className="text-center text-xs text-slate-600">
              Ainda não é afiliado?{" "}
              <Link
                href="/afiliado/cadastro"
                className="font-medium text-slate-950 underline-offset-4 hover:underline"
              >
                Cadastre-se
              </Link>
            </div>
          </div>

          <footer className="pt-3 text-center text-[11px] text-slate-500">
            TradeMiles - portal exclusivo para parceiros afiliados.
          </footer>
        </form>
      </div>
    </main>
  );
}
