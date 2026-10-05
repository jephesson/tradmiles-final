"use client";

import { useEffect, useState } from "react";
import { SOCIO_PAGES } from "@/lib/roles";

type Socio = {
  id: string;
  name: string;
  login: string;
  isActive: boolean;
  allowedPages: string[];
};

export default function SociosPage() {
  const [items, setItems] = useState<Socio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [pages, setPages] = useState<string[]>(["dividas-cartoes"]);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editPages, setEditPages] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/socios", { cache: "no-store", credentials: "include" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setItems(json.data || []);
    } catch (e: any) {
      setError(e?.message || "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function togglePage(list: string[], key: string) {
    return list.includes(key) ? list.filter((x) => x !== key) : [...list, key];
  }

  async function createSocio() {
    setSaving(true);
    try {
      const res = await fetch("/api/socios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, login, password, pages }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao cadastrar.");
      setName("");
      setLogin("");
      setPassword("");
      setPages(["dividas-cartoes"]);
      setShowNew(false);
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(s: Socio) {
    setSaving(true);
    try {
      const res = await fetch(`/api/socios/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pages: editPages,
          ...(editPassword.trim() ? { password: editPassword.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "Erro ao salvar.");
      setEditId(null);
      setEditPassword("");
      await load();
    } catch (e: any) {
      alert(e?.message || "Erro");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(s: Socio) {
    const res = await fetch(`/api/socios/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    const json = await res.json();
    if (!json?.ok) {
      alert(json?.error || "Erro");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cadastro</div>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Sócios</h1>
            <p className="mt-1 text-sm text-slate-500">
              O sócio entra com login próprio e vê só as telas que você marcar. Por enquanto: Dívida cartões (somente visualizar).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
          >
            {showNew ? "Fechar" : "Novo sócio"}
          </button>
        </div>

        {showNew ? (
          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" placeholder="Login" value={login} onChange={(e) => setLogin(e.target.value)} />
              <input className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" type="password" placeholder="Senha (mín. 6)" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pode ver</div>
              {SOCIO_PAGES.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={pages.includes(p.key)}
                    onChange={() => setPages((cur) => togglePage(cur, p.key))}
                  />
                  {p.label} <span className="text-xs text-slate-500">(somente visualizar)</span>
                </label>
              ))}
            </div>
            <button type="button" disabled={saving} onClick={() => void createSocio()} className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60">
              Cadastrar
            </button>
          </div>
        ) : null}
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}
      {loading ? <p className="text-sm text-slate-500">Carregando...</p> : null}

      <div className="space-y-3">
        {items.map((s) => (
          <div key={s.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{s.name}</div>
                <div className="text-sm text-slate-500">Login: {s.login}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Acesso: {s.allowedPages.length ? s.allowedPages.map((k) => SOCIO_PAGES.find((p) => p.key === k)?.label || k).join(", ") : "nenhum"}
                </div>
                {s.isActive === false ? (
                  <span className="mt-1 inline-block rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">Login suspenso</span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs" onClick={() => toggleActive(s)}>
                  {s.isActive === false ? "Reativar" : "Suspender"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  onClick={() => {
                    setEditId(s.id);
                    setEditPages(s.allowedPages || []);
                    setEditPassword("");
                  }}
                >
                  Editar acesso
                </button>
              </div>
            </div>

            {editId === s.id ? (
              <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                {SOCIO_PAGES.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editPages.includes(p.key)}
                      onChange={() => setEditPages((cur) => togglePage(cur, p.key))}
                    />
                    {p.label} (somente visualizar)
                  </label>
                ))}
                <input
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  type="password"
                  placeholder="Nova senha (opcional)"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                />
                <div className="flex gap-2">
                  <button type="button" className="h-9 rounded-xl border px-3 text-sm" onClick={() => setEditId(null)}>
                    Cancelar
                  </button>
                  <button type="button" disabled={saving} className="h-9 rounded-xl bg-slate-900 px-3 text-sm text-white" onClick={() => void saveEdit(s)}>
                    Salvar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {!loading && items.length === 0 ? (
          <div className="rounded-2xl border p-6 text-sm text-slate-500">Nenhum sócio cadastrado.</div>
        ) : null}
      </div>
    </div>
  );
}
