"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "").slice(0, 11);
}

type Role = "admin" | "staff";

export default function EditarFuncionarioPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  // ✅ pega o id real da URL (garante string)
  const id = useMemo(() => {
    const raw = (params as any)?.id;
    if (!raw) return "";
    if (Array.isArray(raw)) return String(raw[0] || "");
    return String(raw);
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [login, setLogin] = useState("");
  const [team, setTeam] = useState("@vias_aereas");
  const [role, setRole] = useState<Role>("staff");
  const [inviteCode, setInviteCode] = useState("");

  // 🔐 troca de senha (3 campos)
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const inviteLink = useMemo(() => {
    if (!inviteCode) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/convite/${inviteCode}`;
  }, [inviteCode]);

  async function load() {
    if (!id) return;

    try {
      setLoading(true);
      setError("");

      const res = await fetch(`/api/funcionarios/${id}`, {
        method: "GET",
        cache: "no-store",
      });

      const json = await res.json().catch(() => null);

      if (!json?.ok) {
        throw new Error(json?.error || "Funcionário não encontrado.");
      }

      const u = json.data;
      setName(u.name ?? "");
      setCpf(u.cpf ?? "");
      setLogin(u.login ?? "");
      setTeam(u.team ?? "@vias_aereas");
      setRole((u.role ?? "staff") as Role);
      setInviteCode(u.inviteCode ?? "");
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // ✅ evita chamar API com id vazio/undefined
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    try {
      setSaving(true);
      setError("");

      // se qualquer campo de senha foi preenchido, exige os 3
      const wantsPasswordChange =
        Boolean(currentPassword.trim()) ||
        Boolean(newPassword.trim()) ||
        Boolean(confirmNewPassword.trim());

      if (wantsPasswordChange) {
        if (!currentPassword.trim()) throw new Error("Informe a senha atual.");
        if (!newPassword.trim()) throw new Error("Informe a nova senha.");
        if (!confirmNewPassword.trim()) throw new Error("Confirme a nova senha.");
        if (newPassword !== confirmNewPassword) throw new Error("A confirmação da nova senha não confere.");
        if (newPassword.trim().length < 6) throw new Error("Nova senha deve ter pelo menos 6 caracteres.");
      }

      const payload: any = {
        name: name.trim(),
        cpf: onlyDigits(cpf),
        login: login.trim().toLowerCase(),
        team: team.trim(),
        role,
      };

      // 🔐 manda só se estiver trocando
      if (wantsPasswordChange) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
        payload.confirmPassword = confirmNewPassword;
      }

      const res = await fetch(`/api/funcionarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Erro ao salvar.");

      alert("Funcionário atualizado ✅");
      router.push("/dashboard/funcionarios");
    } catch (e: any) {
      setError(e?.message || "Erro");
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

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-4">Editar funcionário</h1>

      {loading && (
        <div className="rounded-2xl border p-4 text-sm text-slate-700">Carregando...</div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border p-4">
          <div className="text-sm font-semibold mb-2">Erro:</div>
          <div className="text-sm text-slate-700">{error}</div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard/funcionarios")}
              className="rounded-xl border px-4 py-2"
            >
              Voltar
            </button>

            <button
              type="button"
              onClick={load}
              className="rounded-xl border px-4 py-2"
            >
              Tentar de novo
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
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
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
          </div>

          {/* 🔐 senha com confirmação */}
          <div className="rounded-2xl border p-4 space-y-3">
            <div className="text-sm font-semibold">Alterar senha (opcional)</div>

            <div>
              <label className="block text-sm mb-1">Senha atual</label>
              <input
                type="password"
                className="w-full rounded-xl border px-3 py-2"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Digite a senha atual"
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Nova senha</label>
              <input
                type="password"
                className="w-full rounded-xl border px-3 py-2"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha"
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Confirmar nova senha</label>
              <input
                type="password"
                className="w-full rounded-xl border px-3 py-2"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Repita a nova senha"
              />
            </div>
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
      )}
    </div>
  );
}
