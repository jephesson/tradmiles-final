// app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const params = useSearchParams();
  const router = useRouter();

  // Sanitiza o "next": só aceita caminhos que comecem com /dashboard
  const rawNext = params.get("next");
  const next =
    rawNext && rawNext.startsWith("/dashboard") ? rawNext : "/dashboard";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", login, password }),
    });
    const json = await r.json();
    if (!json.ok) {
      alert(json.error || "Credenciais inválidas");
      return;
    }
    router.replace(next); // agora nunca vai te mandar para "/"
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form onSubmit={onSubmit} className="w-[min(420px,92vw)] space-y-3 rounded-xl border p-5">
        <h1 className="text-xl font-semibold">Entrar</h1>
        <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Login" value={login} onChange={e=>setLogin(e.target.value)} />
        <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="w-full rounded-xl bg-black px-4 py-2 text-white">Entrar</button>
      </form>
    </main>
  );
}
