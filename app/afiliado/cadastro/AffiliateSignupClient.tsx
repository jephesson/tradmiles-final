"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type SignupResult = {
  affiliate: {
    id: string;
    name: string;
    login: string | null;
    status: string;
  };
};

function onlyDigits(value: string) {
  return (value || "").replace(/\D+/g, "");
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export default function AffiliateSignupClient() {
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SignupResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/afiliado/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          cpf: onlyDigits(cpf),
          pixKey,
          password,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Não foi possível enviar seu cadastro.");
        return;
      }
      setResult(json.data);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <main className="min-h-screen bg-slate-50 grid place-items-center p-6">
        <div className="w-[min(460px,92vw)] rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Image
              src="/trademiles.png"
              alt="TradeMiles"
              width={38}
              height={38}
              priority
              className="rounded-md"
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Cadastro enviado</h1>
              <p className="text-xs text-slate-500">Sua solicitação está em análise</p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              Recebemos seu cadastro, {result.affiliate.name}. Depois da aprovação,
              seu acesso será liberado no portal do afiliado.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Login gerado:{" "}
              <span className="font-medium text-slate-800">
                {result.affiliate.login || "em análise"}
              </span>
            </p>
          </div>

          <Link
            href="/afiliado/login"
            className="mt-5 block w-full rounded-xl bg-black px-4 py-2 text-center text-sm font-medium text-white"
          >
            Voltar para o login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 grid place-items-center p-6">
      <div className="w-[min(460px,92vw)]">
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
              className="rounded-md"
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Cadastro de afiliado
              </h1>
              <p className="text-xs text-slate-500">TradeMiles parceiros</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-black/10"
              placeholder="Nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />

            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-black/10"
              placeholder="CPF"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
            />

            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-black/10"
              placeholder="Chave Pix"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              autoComplete="off"
            />

            <div className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-black/10">
              <input
                className="flex-1 outline-none"
                placeholder="Senha"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
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
              {loading ? "Enviando..." : "Enviar cadastro"}
            </button>

            <div className="text-center text-xs text-slate-600">
              Já tem acesso?{" "}
              <Link
                href="/afiliado/login"
                className="font-medium text-slate-950 underline-offset-4 hover:underline"
              >
                Entrar
              </Link>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
