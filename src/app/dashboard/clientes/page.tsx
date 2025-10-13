// src/app/dashboard/clientes/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ===== Tipos ===== */
type Cliente = {
  id: string;
  nome: string;
  origem: string;
  createdAt: string;
  updatedAt: string;
  active?: boolean;
};

type SortKey = "nome" | "origem" | "created";
type SortDir = "asc" | "desc";

/* ===== Utils ===== */
function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ===== Página ===== */
export default function ClientesPage() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [loading, setLoading] = useState(false);

  // edição
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [mode, setMode] = useState<"add" | "edit">("add");

  /* ---- carregar do servidor ao abrir ---- */
  useEffect(() => {
    void loadFromServer();
  }, []);

  async function loadFromServer() {
    try {
      setLoading(true);
      const res = await fetch("/api/clientes");
      const json = await res.json();
      if (json.ok && Array.isArray(json.data?.lista)) {
        setClientes(json.data.lista as Cliente[]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function saveToServer(next: Cliente[]) {
    try {
      setLoading(true);
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lista: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Falha ao salvar");
      setClientes(next);
      alert("Clientes salvos ✅");
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  /* ---- add/edit ---- */
  function openAdd() {
    setMode("add");
    const now = new Date().toISOString();
    setEditing({
      id: uuid(),
      nome: "",
      origem: "",
      createdAt: now,
      updatedAt: now,
      active: true,
    });
    dialogRef.current?.showModal();
  }

  function openEdit(c: Cliente) {
    setMode("edit");
    setEditing(JSON.parse(JSON.stringify(c)) as Cliente);
    dialogRef.current?.showModal();
  }

  function closeModal() {
    dialogRef.current?.close();
    setEditing(null);
  }

  function onChangeField(patch: Partial<Cliente>) {
    if (!editing) return;
    setEditing({ ...editing, ...patch });
  }

  function confirmSaveEditing() {
    if (!editing) return;
    if (!editing.nome.trim()) {
      alert("Informe o nome do cliente.");
      return;
    }
    if (!editing.origem.trim()) {
      alert("Informe a origem.");
      return;
    }
    const now = new Date().toISOString();
    const record = { ...editing, updatedAt: now } as Cliente;

    if (mode === "add") {
      const next = [record, ...clientes];
      void saveToServer(next);
    } else {
      const next = clientes.map(c => (c.id === record.id ? record : c));
      void saveToServer(next);
    }
    closeModal();
  }

  function excluir(id: string) {
    if (!confirm("Excluir este cliente?")) return;
    const next = clientes.filter(c => c.id !== id);
    void saveToServer(next);
  }

  /* ---- lista visível ---- */
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return clientes.filter(c => {
      if (!term) return true;
      const hay = `${c.nome} ${c.origem}`.toLowerCase();
      return hay.includes(term);
    });
  }, [clientes, q]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortKey === "nome") {
        const an = a.nome.toLowerCase();
        const bn = b.nome.toLowerCase();
        if (an < bn) return -1 * dir;
        if (an > bn) return 1 * dir;
        return 0;
      }
      if (sortKey === "origem") {
        const ao = a.origem.toLowerCase();
        const bo = b.origem.toLowerCase();
        if (ao < bo) return -1 * dir;
        if (ao > bo) return 1 * dir;
        return 0;
      }
      // created
      const av = new Date(a.createdAt).getTime();
      const bv = new Date(b.createdAt).getTime();
      return av === bv ? 0 : av < bv ? -1 * dir : 1 * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  /* ---- UI ---- */
  return (
    <main className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Clientes</h1>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nome ou origem…"
            className="rounded-xl border px-3 py-2 text-sm"
          />

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={`${sortKey}:${sortDir}`}
            onChange={e => {
              const [k, d] = e.target.value.split(":") as [SortKey, SortDir];
              setSortKey(k);
              setSortDir(d);
            }}
          >
            <option value="nome:asc">Ordenar: Nome (A→Z)</option>
            <option value="nome:desc">Ordenar: Nome (Z→A)</option>
            <option value="origem:asc">Ordenar: Origem (A→Z)</option>
            <option value="origem:desc">Ordenar: Origem (Z→A)</option>
            <option value="created:desc">Ordenar: Recentes</option>
            <option value="created:asc">Ordenar: Antigos</option>
          </select>

          <button
            onClick={openAdd}
            className="rounded-xl bg-black px-4 py-2 text-white"
          >
            Adicionar
          </button>

          <button
            onClick={loadFromServer}
            disabled={loading}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Carregar do servidor"}
          </button>
          <button
            onClick={() => void saveToServer(clientes)}
            disabled={loading}
            className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            Salvar no servidor
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                  Nenhum cliente cadastrado.
                </td>
              </tr>
            )}
            {sorted.map((c, i) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                <td className="px-3 py-2">{c.nome}</td>
                <td className="px-3 py-2">{c.origem}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => excluir(c.id)}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal add/editar */}
      <dialog ref={dialogRef} className="rounded-xl p-0 backdrop:bg-black/40">
        <form
          method="dialog"
          className="w-[min(560px,92vw)] rounded-xl bg-white p-5"
          onSubmit={e => {
            e.preventDefault();
            confirmSaveEditing();
          }}
        >
          <h2 className="mb-4 text-lg font-semibold">
            {mode === "add" ? "Adicionar cliente" : "Editar cliente"}
          </h2>

          {editing && (
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-600">Nome</label>
                <input
                  value={editing.nome}
                  onChange={e => onChangeField({ nome: e.target.value })}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Origem</label>
                <input
                  value={editing.origem}
                  onChange={e => onChangeField({ origem: e.target.value })}
                  placeholder="ex.: Instagram, Indicação, WhatsApp…"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-black px-4 py-2 text-sm text-white"
            >
              Salvar
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
