"use client";

import { useState } from "react";

export default function NovoFuncionarioPage() {
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [login, setLogin] = useState("");
  const [team, setTeam] = useState("Milhas");
  const [password, setPassword] = useState("");

  function onlyDigits(v: string) {
    return (v || "").replace(/\D+/g, "").slice(0, 11);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);

      const res = await fetch("/api/funcionarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cpf: onlyDigits(cpf),
          login: login.trim(),
          team: team.trim(),
          password,
        }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao cadastrar.");

      alert("Funcionário criado ✅");
      window.location.href = "/dashboard/funcionarios";
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
          <input className="w-full rounded-xl border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
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
          <input className="w-full rounded-xl border px-3 py-2" value={login} onChange={(e) => setLogin(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm mb-1">Time</label>
          <input className="w-full rounded-xl border px-3 py-2" value={team} onChange={(e) => setTeam(e.target.value)} />
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

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Cadastrar funcionário"}
        </button>
      </form>
    </div>
  );
}
