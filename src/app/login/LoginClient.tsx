// src/app/login/LoginClient.tsx
"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <main className="min-h-screen grid place-items-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-[min(420px,92vw)] space-y-4 rounded-2xl border p-6 shadow-sm"
      >
        {/* Header com logo + nome */}
        <div className="flex items-center gap-3">
          <Image
            src="/trademiles.png"
            alt="TradeMiles"
            width={36}
            height={36}
            priority
            className="rounded-md"
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">TradeMiles</h1>
            <p className="text-xs text-neutral-500">Acesse seu painel</p>
          </div>
        </div>

        {/* Campos */}
        <div className="space-y-3 pt-2">
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="Login"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
          />

          <div className="w-full rounded-xl border px-3 py-2 text-sm flex items-center gap-2">
            <input
              className="outline-none flex-1"
              placeholder="Senha"
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="text-xs text-neutral-500"
              aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPwd ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          {err && <p className="text-xs text-red-600">{err}</p>}

          <button
            className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </div>

        <p className="text-[11px] text-neutral-500 text-center pt-1">
          © {new Date().getFullYear()} TradeMiles
        </p>
      </form>
    </main>
  );
}
