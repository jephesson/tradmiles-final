"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginClient() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const params = useSearchParams();
  const router = useRouter();

  // Sanitiza o "next": só aceita caminhos que comecem com /dashboard
  const next = useMemo(() => {
    const raw = params.get("next");
    return raw && raw.startsWith("/dashboard") ? raw : "/dashboard";
  }, [params]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", login, password }),
      });

      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json?.ok) {
        alert(json?.error || "Credenciais inválidas");
        return;
      }

      router.replace(next); // nunca manda para "/"
    } catch (err) {
      console.error(err);
      alert("Falha ao entrar. Tente novamente.");
    }
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-[min(420px,92vw)] space-y-3 rounded-xl border p-5"
      >
        <h1 className="text-xl font-semibold">Entrar</h1>

        <input
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="Login"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
        />

        <input
          className="w-full rounded-xl border px-3 py-2 text-sm"
          placeholder="Senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button className="w-full rounded-xl bg-black px-4 py-2 text-white">
          Entrar
        </button>
      </form>
    </main>
  );
}
