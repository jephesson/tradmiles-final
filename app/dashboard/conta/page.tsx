"use client";

import { useState } from "react";
import { getSession } from "@/lib/auth";

export default function ContaPage() {
  const session = getSession();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setMsg("");
    setError("");
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ oldPassword, newPassword, newPassword2 }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Não foi possível alterar.");
      setOldPassword("");
      setNewPassword("");
      setNewPassword2("");
      setMsg("Senha alterada.");
    } catch (e: any) {
      setError(e?.message || "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Conta</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Alterar senha</h1>
        <p className="mt-1 text-sm text-slate-500">
          {session?.name ? `${session.name} · ` : ""}login {session?.login || ""}
        </p>

        <div className="mt-4 space-y-3">
          <input
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
            type="password"
            placeholder="Senha atual"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
          <input
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
            type="password"
            placeholder="Nova senha (mín. 6)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <input
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
            type="password"
            placeholder="Repetir nova senha"
            value={newPassword2}
            onChange={(e) => setNewPassword2(e.target.value)}
          />
          {error ? <div className="text-sm text-rose-700">{error}</div> : null}
          {msg ? <div className="text-sm text-emerald-700">{msg}</div> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar senha"}
          </button>
        </div>
      </div>
    </div>
  );
}
