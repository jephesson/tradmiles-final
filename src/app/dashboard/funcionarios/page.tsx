// src/app/dashboard/funcionarios/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  loadFuncionarios,
  saveFuncionarios,
  loadTeam,
  type Funcionario,
} from "@/lib/staff";

type SortKey = "id" | "nome" | "login" | "role";
type SortDir = "asc" | "desc";

export default function FuncionariosPage() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [list, setList] = useState<Funcionario[]>([]);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // edição
  const [editing, setEditing] = useState<Funcionario | null>(null);

  // senha (apenas para /api/auth -> data/auth.json)
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  const teamMeta = loadTeam();

  /* ---------- carregar ---------- */
  useEffect(() => {
    setList(loadFuncionarios());
  }, []);

  /* ---------- helpers ---------- */
  function openAdd() {
    setEditing({
      id: "",
      nome: "",
      email: "",
      login: "",
      role: "staff",
      team: teamMeta.name,
      active: true,
    });
    dialogRef.current?.showModal();
  }

  function openEdit(f: Funcionario) {
    // cria cópia profunda simples
    setEditing(JSON.parse(JSON.stringify(f)) as Funcionario);
    dialogRef.current?.showModal();
  }

  function closeModal() {
    dialogRef.current?.close();
    setEditing(null);
    setPwd1("");
    setPwd2("");
    setPwdSaving(false);
  }

  function onChangeField(patch: Partial<Funcionario>) {
    if (!editing) return;
    setEditing({ ...editing, ...patch });
  }

  function onSaveEditing() {
    if (!editing) return;
    if (!editing.id.trim()) {
      alert("Informe o ID do funcionário (ex.: F001).");
      return;
    }
    if (!editing.nome.trim()) {
      alert("Informe o nome.");
      return;
    }
    const exists = list.some(
      (x) => x.id.trim().toLowerCase() === editing.id.trim().toLowerCase()
    );
    const next: Funcionario[] = exists
      ? list.map((x) => (x.id === editing.id ? editing : x))
      : [...list, editing];

    saveFuncionarios(next);
    setList(next);
    closeModal();
  }

  function onDelete(id: string) {
    if (!confirm("Excluir este funcionário?")) return;
    const next = list.filter((x) => x.id !== id);
    saveFuncionarios(next);
    setList(next);
  }

  /* ---------- senha (data/auth.json via /api/auth) ---------- */
  async function setPasswordNow() {
    if (!editing) return;
    const login = (editing.login || editing.id || "").trim();
    if (!login) {
      alert("Defina o campo 'Login' (ou ao menos o 'ID') para atribuir a senha.");
      return;
    }
    if (!pwd1) {
      alert("Informe a nova senha.");
      return;
    }
    if (pwd1 !== pwd2) {
      alert("As senhas não coincidem.");
      return;
    }
    setPwdSaving(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setPassword", login, password: pwd1 }),
      });
      const json: { ok?: boolean; error?: string } = await res.json();
      if (!json.ok) throw new Error(json.error || "Falha ao definir senha.");
      alert(`Senha atualizada para ${login}.`);
      setPwd1("");
      setPwd2("");
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(e?.message || "Erro ao definir senha.");
    } finally {
      setPwdSaving(false);
    }
  }

  /* ---------- lista filtrada/ordenada ---------- */
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return list.filter((f) => {
      if (term === "") return true;
      const hay =
        (f.id || "") +
        " " +
        (f.nome || "") +
        " " +
        (f.login || "") +
        " " +
        (f.email || "");
      return hay.toLowerCase().includes(term);
    });
  }, [list, q]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortKey === "id") {
        av = (a.id || "").toLowerCase();
        bv = (b.id || "").toLowerCase();
      } else if (sortKey === "nome") {
        av = (a.nome || "").toLowerCase();
        bv = (b.nome || "").toLowerCase();
      } else if (sortKey === "login") {
        av = (a.login || "").toLowerCase();
        bv = (b.login || "").toLowerCase();
      } else {
        av = (a.role || "staff").toLowerCase();
        bv = (b.role || "staff").toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  /* ---------- UI ---------- */
  return (
    <main className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Funcionários</h1>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, ID ou login…"
            className="rounded-xl border px-3 py-2 text-sm"
          />
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":") as [SortKey, SortDir];
              setSortKey(k);
              setSortDir(d);
            }}
          >
            <option value="id:asc">Ordenar: ID (↑)</option>
            <option value="id:desc">Ordenar: ID (↓)</option>
            <option value="nome:asc">Ordenar: Nome (A→Z)</option>
            <option value="nome:desc">Ordenar: Nome (Z→A)</option>
            <option value="login:asc">Ordenar: Login (A→Z)</option>
            <option value="login:desc">Ordenar: Login (Z→A)</option>
            <option value="role:asc">Ordenar: Papel (A→Z)</option>
            <option value="role:desc">Ordenar: Papel (Z→A)</option>
          </select>
          <button
            onClick={openAdd}
            className="rounded-xl bg-black px-4 py-2 text-white"
          >
            Adicionar
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm text-slate-700">
          Time atual: <b>{teamMeta.name}</b> • Admin:{" "}
          <b>{teamMeta.adminName}</b> (<code>{teamMeta.adminLogin}</code>)
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">Login</th>
              <th className="px-3 py-2 font-medium">E-mail</th>
              <th className="px-3 py-2 font-medium">Papel</th>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="px-3 py-2 font-mono">{f.id}</td>
                <td className="px-3 py-2">{f.nome}</td>
                <td className="px-3 py-2">{f.login || "—"}</td>
                <td className="px-3 py-2">{f.email || "—"}</td>
                <td className="px-3 py-2">
                  {f.role === "admin" ? "Admin" : "Staff"}
                </td>
                <td className="px-3 py-2">{f.team || "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs " +
                      (f.active !== false
                        ? "border-emerald-300 text-emerald-700"
                        : "border-slate-300 text-slate-600")
                    }
                  >
                    {f.active !== false ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => openEdit(f)}
                      className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onDelete(f.id)}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>
                  Nenhum funcionário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal add/editar */}
      <dialog ref={dialogRef} className="rounded-xl p-0 backdrop:bg-black/40">
        <form
          method="dialog"
          className="w-[min(760px,92vw)] rounded-xl bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSaveEditing();
          }}
        >
          <h2 className="mb-4 text-lg font-semibold">Editar funcionário</h2>

          {editing && (
            <div className="grid grid-cols-1 gap-3">
              {/* Linha 1: ID, Nome */}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-600">ID</label>
                  <input
                    value={editing.id}
                    onChange={(e) => onChangeField({ id: e.target.value })}
                    placeholder="ex.: F001"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">
                    Nome
                  </label>
                  <input
                    value={editing.nome}
                    onChange={(e) => onChangeField({ nome: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Linha 2: Login, Email */}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-600">
                    Login
                  </label>
                  <input
                    value={editing.login || ""}
                    onChange={(e) => onChangeField({ login: e.target.value })}
                    placeholder="ex.: jephesson"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">
                    E-mail
                  </label>
                  <input
                    value={editing.email || ""}
                    onChange={(e) => onChangeField({ email: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Linha 3: Papel, Time, Ativo */}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-600">
                    Papel
                  </label>
                  <select
                    value={editing.role || "staff"}
                    onChange={(e) =>
                      onChangeField({
                        role: (e.target.value as "admin" | "staff") || "staff",
                      })
                    }
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">
                    Time
                  </label>
                  <input
                    value={editing.team || ""}
                    onChange={(e) => onChangeField({ team: e.target.value })}
                    placeholder="@vias_aereas"
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                <label className="mt-6 flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={editing.active !== false}
                    onChange={(e) =>
                      onChangeField({ active: e.target.checked })
                    }
                  />
                  Ativo
                </label>
              </div>

              {/* ====== Senha (grava em data/auth.json) ====== */}
              <div className="mt-2 rounded-lg border p-3">
                <div className="mb-2 text-sm font-medium">Senha</div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">
                      Nova senha
                    </label>
                    <input
                      type="password"
                      value={pwd1}
                      onChange={(e) => setPwd1(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">
                      Repetir senha
                    </label>
                    <input
                      type="password"
                      value={pwd2}
                      onChange={(e) => setPwd2(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={setPasswordNow}
                      disabled={pwdSaving || !pwd1 || pwd1 !== pwd2}
                      className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
                    >
                      {pwdSaving ? "Salvando..." : "Definir senha"}
                    </button>
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  A senha é salva em <code>data/auth.json</code> via{" "}
                  <code>/api/auth</code>. O cadastro do funcionário <b>não</b>{" "}
                  guarda a senha.
                </div>
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
