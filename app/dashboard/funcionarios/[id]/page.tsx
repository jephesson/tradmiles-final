"use client";

import { useEffect, useMemo, useState } from "react";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

export default function EditarFuncionarioPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [login, setLogin] = useState("");
  const [team, setTeam] = useState("Milhas");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [password, setPassword] = useState("");

  const [inviteCode, setInviteCode] = useState<string>("");

  const inviteLink = useMemo(() => {
    if (!inviteCode) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/convite/${inviteCode}`;
  }, [inviteCode]);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch(`/api/funcionarios/${id}`, { method: "GET", cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao carregar.");

      const u = json.data;
      setName(u.name ?? "");
      setCpf(u.cpf ?? "");
      setLogin(u.login ?? "");
      setTeam(u.team ?? "Milhas");
      setRole((u.role ?? "staff") as any);
      setInviteCode(u.inviteCode ?? "");
    } catch (e: any) {
      alert(e?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);

      const payload: any = {
        name: name.trim(),
        cpf: onlyDigits(cpf),
        login: login.trim(),
        team: team.trim(),
        role,
      };

      // senha só atualiza se preencher
      if (password.trim()) payload.password = password;

      const res = await fetch(`/api/funcionarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao salvar.");

      alert("Funcionário atualizado ✅");
      window.location.href = "/dashboard/funcionarios";
    } catch (e: any) {
      alert(e?.message || "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function copiarConvite() {
    try {
      if (!inviteLink) return;
      await navigator.clipboard.writeText(inviteLink);
      alert("Link copiado ✅");
    } catch {
      alert("Não consegui copiar automaticamente. Selecione e copie.");
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-4">Editar funcionário</h1>
        <div className="rounded-2xl border p-4">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Editar funcionário</h1>

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

        <div>
          <label className="block text-sm mb-1">Time</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Cargo</label>
          <select
            className="w-full rounded-xl border px-3 py-2"
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
          >
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1">Nova senha (opcional)</label>
          <input
            type="password"
            className="w-full rounded-xl border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="deixe vazio para não trocar"
          />
        </div>

        <div className="rounded-2xl border p-3">
          <div className="text-sm font-semibold mb-2">Link de convite</div>
          <div className="flex gap-2">
            <input
              className="w-full rounded-xl border px-3 py-2"
              readOnly
              value={inviteLink || ""}
              placeholder="(ainda sem link)"
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
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </form>
    </div>
  );
}
