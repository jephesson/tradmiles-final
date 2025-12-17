"use client";

import { useMemo, useState } from "react";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

function baseUrl() {
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  if (env) return env;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export default function NovoFuncionarioPage() {
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [login, setLogin] = useState("");

  // ✅ time automático
  const TEAM_FIXED = "@vias_aereas";
  const [team] = useState(TEAM_FIXED);

  const [password, setPassword] = useState("");

  // ✅ convite gerado ao cadastrar
  const [inviteCode, setInviteCode] = useState<string>("");
  const appBase = useMemo(() => baseUrl(), []);
  const inviteLink = useMemo(() => {
    if (!inviteCode) return "";
    return `${appBase}/convite/${inviteCode}`;
  }, [appBase, inviteCode]);

  async function copiarConvite() {
    try {
      if (!inviteLink) return;
      await navigator.clipboard.writeText(inviteLink);
      alert("Link copiado ✅");
    } catch {
      alert("Não consegui copiar automaticamente. Selecione e copie.");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);

      const payload = {
        name: name.trim(),
        cpf: onlyDigits(cpf),
        login: login.trim().toLowerCase(),
        team, // ✅ sempre @vias_aereas
        password,
      };

      if (!payload.name) throw new Error("Nome obrigatório.");
      if (!payload.login) throw new Error("Login obrigatório.");
      if (!payload.password || payload.password.trim().length < 6) {
        throw new Error("Senha deve ter pelo menos 6 caracteres.");
      }

      const res = await fetch("/api/funcionarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao cadastrar.");

      // ✅ pega convite retornado pela API
      setInviteCode(json?.data?.inviteCode ?? "");

      alert("Funcionário criado ✅");

      // Se quiser manter o comportamento antigo (ir pra lista), descomenta:
      // window.location.href = "/dashboard/funcionarios";
    } catch (e: any) {
      alert(e?.message || "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Novo funcionário</h1>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border p-4">
        <div>
          <label className="block text-sm mb-1">Nome completo</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">CPF</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            value={cpf}
            onChange={(e) => setCpf(onlyDigits(e.target.value))}
            placeholder="Somente números"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Login</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>

        {/* ✅ Time fixo */}
        <div>
          <label className="block text-sm mb-1">Time</label>
          <input
            className="w-full rounded-xl border px-3 py-2 bg-slate-50"
            value={team}
            readOnly
          />
          <div className="text-xs text-slate-500 mt-1">
            Time é fixo como <span className="font-semibold">@vias_aereas</span>.
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">Senha</label>
          <input
            type="password"
            className="w-full rounded-xl border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="mínimo 6 caracteres"
          />
        </div>

        {/* ✅ Link de convite aparece após cadastrar */}
        <div className="rounded-2xl border p-3">
          <div className="text-sm font-semibold mb-2">Link de convite</div>
          <div className="flex gap-2">
            <input
              className="w-full rounded-xl border px-3 py-2"
              readOnly
              value={inviteLink || ""}
              placeholder="(será gerado ao cadastrar)"
            />
            <button
              type="button"
              onClick={copiarConvite}
              disabled={!inviteLink}
              className="rounded-xl border px-4 py-2 disabled:opacity-60"
            >
              Copiar
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Cadastrar funcionário"}
        </button>

        {/* opcional: depois de criar, mostrar botão pra ir pra lista */}
        {inviteCode && (
          <button
            type="button"
            className="rounded-xl border px-4 py-2 w-full"
            onClick={() => (window.location.href = "/dashboard/funcionarios")}
          >
            Ir para funcionários
          </button>
        )}
      </form>
    </div>
  );
}
