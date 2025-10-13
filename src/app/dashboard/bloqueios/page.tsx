// src/app/dashboard/bloqueios/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ===== Tipos ===== */
type CIAKey = "latam" | "esfera" | "livelo" | "smiles";

type Cedente = {
  identificador: string;
  nome_completo: string;
  latam?: number;
  esfera?: number;
  livelo?: number;
  smiles?: number;
  responsavelId?: string | null;
  responsavelNome?: string | null;
};

type Bloqueio = {
  id: string;
  cedenteId: string;
  cedenteNome: string;
  cia: CIAKey;
  startedAt: string; // ISO
  expectedUnlockAt: string | null; // ISO ou null
  periodDays: number | null;
  notes?: string | null;
  active: boolean;
  history: Array<{
    startedAt: string;
    endedAt: string | null;
    expectedUnlockAt: string | null;
    periodDays: number | null;
    notes?: string | null;
    cia: CIAKey;
  }>;
};

type SortKey = "nome" | "cia" | "inicio" | "desbloqueio" | "restam";
type SortDir = "asc" | "desc";

/* ===== Constantes ===== */
const BLOQ_KEY = "TM_BLOQUEIOS";

/* ===== Helpers ===== */
function uuid() {
  const v = (globalThis.crypto as Crypto | undefined)?.randomUUID?.();
  if (v) return v;
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function addDays(isoDate: string, days: number) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}
function daysLeft(toIso: string | null) {
  if (!toIso) return null;
  const today = new Date();
  const to = new Date(toIso);
  const diff = Math.ceil((to.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}
function ciaLabel(k: CIAKey) {
  return k === "latam" ? "Latam" : k === "esfera" ? "Esfera" : k === "livelo" ? "Livelo" : "Smiles";
}
function pickListaFromApi(json: unknown): Bloqueio[] {
  const obj = json as
    | {
        data?: { lista?: Bloqueio[]; listaBloqueios?: Bloqueio[] };
        lista?: Bloqueio[];
        listaBloqueios?: Bloqueio[];
        items?: Bloqueio[];
      }
    | undefined;

  return (
    obj?.data?.lista ??
    obj?.data?.listaBloqueios ??
    obj?.lista ??
    obj?.listaBloqueios ??
    obj?.items ??
    []
  );
}

/* ===== Página ===== */
export default function BloqueiosPage() {
  // dados
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([]);
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [loading, setLoading] = useState(false);

  // filtros/ordenação/seleção
  const [q, setQ] = useState("");
  const [filterCIA, setFilterCIA] = useState<"all" | CIAKey>("all");
  const [showHistory, setShowHistory] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("restam");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // modal
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Bloqueio | null>(null);
  const [mode, setMode] = useState<"add" | "edit">("add");

  const setBloqueiosAndPersist = useCallback((next: Bloqueio[]) => {
    setBloqueios(next);
    try {
      localStorage.setItem(BLOQ_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const loadFromServer = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/bloqueios", { method: "GET", cache: "no-store" });
      const json = await res.json();
      if (json?.ok) {
        const lista: Bloqueio[] = pickListaFromApi(json);
        if (Array.isArray(lista)) setBloqueiosAndPersist(lista);
      }
    } catch (e) {
      // loga, mas não quebra a página
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [setBloqueiosAndPersist]);

  const loadCedentes = useCallback(async () => {
    try {
      const res = await fetch("/api/cedentes", { method: "GET", cache: "no-store" });
      const json = await res.json();
      const list: Cedente[] = json?.data?.listaCedentes ?? [];
      if (Array.isArray(list)) setCedentes(list);
    } catch (e) {
      console.error(e);
    }
  }, []);

  /* ---------- carregar dados ---------- */
  useEffect(() => {
    // 1) tenta localStorage (não some quando sair e voltar)
    try {
      const raw = localStorage.getItem(BLOQ_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setBloqueios(arr);
      }
    } catch {
      /* ignore */
    }

    // 2) sincroniza com o servidor
    void loadFromServer();

    // 3) carrega cedentes para o select
    void loadCedentes();
  }, [loadFromServer, loadCedentes]);

  async function saveToServer(next: Bloqueio[]) {
    try {
      setLoading(true);
      // Salva **padronizado** como { lista: [...] }
      const res = await fetch("/api/bloqueios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lista: next, meta: { source: "bloqueios" } }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Falha ao salvar");
      setBloqueiosAndPersist(next);
      setSelected(new Set());
      alert("Bloqueios salvos ✅");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      alert(`Erro ao salvar: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- adicionar/editar ---------- */
  function openAdd() {
    setMode("add");
    const todayIso = new Date().toISOString();
    setEditing({
      id: uuid(),
      cedenteId: "",
      cedenteNome: "",
      cia: "latam",
      startedAt: todayIso,
      periodDays: 30,
      expectedUnlockAt: addDays(todayIso, 30),
      notes: "",
      active: true,
      history: [],
    });
    dialogRef.current?.showModal();
  }

  function openEdit(b: Bloqueio) {
    setMode("edit");
    setEditing(JSON.parse(JSON.stringify(b)) as Bloqueio);
    dialogRef.current?.showModal();
  }

  function onChangeField(patch: Partial<Bloqueio>) {
    if (!editing) return;
    const base = { ...editing, ...patch } as Bloqueio;

    // se mudar startedAt ou periodDays (e houver periodDays), recalc expected
    if ((patch.startedAt || patch.periodDays !== undefined) && base.periodDays && base.periodDays > 0) {
      const recalculated = addDays(base.startedAt, base.periodDays);
      setEditing({ ...base, expectedUnlockAt: recalculated });
      return;
    }

    setEditing(base);
  }

  function onChangeCedente(id: string) {
    if (!editing) return;
    const c = cedentes.find((x) => x.identificador === id);
    if (c) {
      onChangeField({ cedenteId: c.identificador, cedenteNome: c.nome_completo });
    } else {
      onChangeField({ cedenteId: "", cedenteNome: "" });
    }
  }

  function confirmSaveEditing() {
    if (!editing) return;
    if (!editing.cedenteId) {
      alert("Selecione um cedente.");
      return;
    }
    if (!editing.startedAt) {
      alert("Defina a data de início.");
      return;
    }

    if (mode === "add") {
      const next = [editing, ...bloqueios];
      void saveToServer(next);
    } else {
      const next = bloqueios.map((b) => (b.id === editing.id ? editing : b));
      void saveToServer(next);
    }
    dialogRef.current?.close();
    setEditing(null);
  }

  /* ---------- ações de linha / massa ---------- */
  function toggleOne(id: string) {
    setSelected((prev) => {
      const nxt = new Set(prev);
      if (nxt.has(id)) nxt.delete(id);
      else nxt.add(id);
      return nxt;
    });
  }
  function toggleAll(ids: string[], check: boolean) {
    setSelected(check ? new Set(ids) : new Set());
  }

  function excluirSelecionados(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(`Excluir ${ids.length} bloqueio(s)?`)) return;
    const next = bloqueios.filter((b) => !ids.includes(b.id));
    void saveToServer(next);
  }

  function encerrarAgora(id: string) {
    const nowIso = new Date().toISOString();
    const next = bloqueios.map((b) => {
      if (b.id !== id) return b;
      if (!b.active) return b;
      const hist = [
        {
          startedAt: b.startedAt,
          endedAt: nowIso,
          expectedUnlockAt: b.expectedUnlockAt,
          periodDays: b.periodDays,
          notes: b.notes || null,
          cia: b.cia,
        },
        ...b.history,
      ];
      return { ...b, active: false, history: hist } as Bloqueio;
    });
    void saveToServer(next);
  }

  function encerrarSelecionados(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(`Encerrar agora ${ids.length} bloqueio(s)?`)) return;
    const nowIso = new Date().toISOString();
    const next = bloqueios.map((b) => {
      if (!ids.includes(b.id) || !b.active) return b;
      return {
        ...b,
        active: false,
        history: [
          {
            startedAt: b.startedAt,
            endedAt: nowIso,
            expectedUnlockAt: b.expectedUnlockAt,
            periodDays: b.periodDays,
            notes: b.notes || null,
            cia: b.cia,
          },
          ...b.history,
        ],
      } as Bloqueio;
    });
    void saveToServer(next);
  }

  /* ---------- lista visível ---------- */
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return bloqueios.filter((b) => {
      if (!showHistory && !b.active) return false;
      if (filterCIA !== "all" && b.cia !== filterCIA) return false;
      if (!term) return true;
      const hay =
        b.cedenteNome.toLowerCase() +
        " " +
        b.cedenteId.toLowerCase() +
        " " +
        ciaLabel(b.cia).toLowerCase();
      return hay.includes(term);
    });
  }, [bloqueios, q, filterCIA, showHistory]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      if (sortKey === "nome") {
        const an = a.cedenteNome.toLowerCase();
        const bn = b.cedenteNome.toLowerCase();
        if (an < bn) return -1 * dir;
        if (an > bn) return 1 * dir;
        return 0;
      }
      if (sortKey === "cia") {
        const an = a.cia;
        const bn = b.cia;
        if (an < bn) return -1 * dir;
        if (an > bn) return 1 * dir;
        return 0;
      }
      if (sortKey === "inicio") {
        const av = new Date(a.startedAt).getTime();
        const bv = new Date(b.startedAt).getTime();
        return av === bv ? 0 : av < bv ? -1 * dir : 1 * dir;
      }
      if (sortKey === "desbloqueio") {
        const av = a.expectedUnlockAt ? new Date(a.expectedUnlockAt).getTime() : 0;
        const bv = b.expectedUnlockAt ? new Date(b.expectedUnlockAt).getTime() : 0;
        return av === bv ? 0 : av < bv ? -1 * dir : 1 * dir;
      }
      // restam
      const ad = daysLeft(a.expectedUnlockAt) ?? -999999;
      const bd = daysLeft(b.expectedUnlockAt) ?? -999999;
      return ad === bd ? 0 : ad < bd ? -1 * dir : 1 * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const visibleIds = useMemo(() => sorted.map((b) => b.id), [sorted]);

  /* ---------- UI ---------- */
  return (
    <main className="p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Bloqueios</h1>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cedente, ID ou CIA…"
            className="rounded-xl border px-3 py-2 text-sm"
          />

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={filterCIA}
            onChange={(e) => setFilterCIA(e.target.value as "all" | CIAKey)}
          >
            <option value="all">Todas as Cias</option>
            <option value="latam">Latam</option>
            <option value="esfera">Esfera</option>
            <option value="livelo">Livelo</option>
            <option value="smiles">Smiles</option>
          </select>

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={`${sortKey}:${sortDir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(":");
              setSortKey(k as SortKey);
              setSortDir(d as SortDir);
            }}
          >
            <option value="restam:asc">Ordenar: Restam (↑)</option>
            <option value="restam:desc">Ordenar: Restam (↓)</option>
            <option value="desbloqueio:asc">Ordenar: Desbloqueio (↑)</option>
            <option value="desbloqueio:desc">Ordenar: Desbloqueio (↓)</option>
            <option value="inicio:asc">Ordenar: Início (↑)</option>
            <option value="inicio:desc">Ordenar: Início (↓)</option>
            <option value="nome:asc">Ordenar: Nome (A→Z)</option>
            <option value="nome:desc">Ordenar: Nome (Z→A)</option>
            <option value="cia:asc">Ordenar: CIA (A→Z)</option>
            <option value="cia:desc">Ordenar: CIA (Z→A)</option>
          </select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
            />
            Mostrar históricos (encerrados)
          </label>

          <button onClick={openAdd} className="rounded-xl bg-black px-4 py-2 text-white">
            Adicionar bloqueio
          </button>

          <button
            onClick={loadFromServer}
            disabled={loading}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Carregando..." : "Carregar do servidor"}
          </button>
          <button
            onClick={() => void saveToServer(bloqueios)}
            disabled={loading}
            className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            Salvar no servidor
          </button>
        </div>
      </div>

      {/* ações em massa */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-600">
          Selecionados: <b>{selected.size}</b>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => encerrarSelecionados(Array.from(selected))}
            disabled={!selected.size}
            className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
          >
            Encerrar selecionados
          </button>
          <button
            onClick={() => excluirSelecionados(Array.from(selected))}
            disabled={!selected.size}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Excluir selecionados
          </button>
        </div>
      </div>

      {/* tabela */}
      <div className="rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left">
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))}
                  onChange={(e) => toggleAll(visibleIds, e.target.checked)}
                />
              </th>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Cedente</th>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">CIA</th>
              <th className="px-3 py-2 font-medium">Início</th>
              <th className="px-3 py-2 font-medium">Prev. desbloqueio</th>
              <th className="px-3 py-2 font-medium text-right">Restam</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={10}>
                  Nenhum bloqueio encontrado.
                </td>
              </tr>
            )}

            {sorted.map((b, i) => {
              const checked = selected.has(b.id);
              const left = daysLeft(b.expectedUnlockAt);
              const status = b.active ? "Ativo" : "Encerrado";
              return (
                <tr key={b.id} className="border-t">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={checked}
                      onChange={() => toggleOne(b.id)}
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2">{b.cedenteNome}</td>
                  <td className="px-3 py-2 font-mono">{b.cedenteId}</td>
                  <td className="px-3 py-2">{ciaLabel(b.cia)}</td>
                  <td className="px-3 py-2">{fmtDate(b.startedAt)}</td>
                  <td className="px-3 py-2">{fmtDate(b.expectedUnlockAt)}</td>
                  <td className="px-3 py-2 text-right">{left === null ? "—" : `${left}d`}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        "inline-flex rounded-lg px-2 py-1 text-xs " +
                        (b.active
                          ? "border border-amber-500 text-amber-700"
                          : "border border-slate-300 text-slate-600")
                      }
                    >
                      {status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(b)}
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      {b.active && (
                        <button
                          onClick={() => encerrarAgora(b.id)}
                          className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                        >
                          Encerrar
                        </button>
                      )}
                      <button
                        onClick={() => excluirSelecionados([b.id])}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                      >
                        Excluir
                      </button>
                    </div>

                    {b.history.length > 0 && (
                      <div className="mt-1 text-[11px] text-slate-500">
                        Histórico: {b.history.length} registro(s)
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* modal add/editar */}
      <dialog ref={dialogRef} className="rounded-xl p-0 backdrop:bg-black/40">
        <form
          method="dialog"
          className="w-[min(720px,92vw)] rounded-xl bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            confirmSaveEditing();
          }}
        >
          <h2 className="mb-4 text-lg font-semibold">
            {mode === "add" ? "Adicionar bloqueio" : "Editar bloqueio"}
          </h2>

          {editing && (
            <div className="grid grid-cols-1 gap-3">
              {/* Cedente + CIA */}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-slate-600">Cedente</label>
                  <select
                    value={editing.cedenteId}
                    onChange={(e) => onChangeCedente(e.target.value)}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  >
                    <option value="">— Selecionar —</option>
                    {cedentes.map((c) => (
                      <option key={c.identificador} value={c.identificador}>
                        {c.identificador} — {c.nome_completo}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">CIA</label>
                  <select
                    value={editing.cia}
                    onChange={(e) => onChangeField({ cia: e.target.value as CIAKey })}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  >
                    <option value="latam">Latam</option>
                    <option value="esfera">Esfera</option>
                    <option value="livelo">Livelo</option>
                    <option value="smiles">Smiles</option>
                  </select>
                </div>
              </div>

              {/* Datas */}
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-600">Início</label>
                  <input
                    type="date"
                    value={editing.startedAt.slice(0, 10)}
                    onChange={(e) =>
                      onChangeField({ startedAt: new Date(e.target.value).toISOString() })
                    }
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">Período (dias)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="ex.: 30"
                    value={editing.periodDays ?? 0}
                    onChange={(e) =>
                      onChangeField({ periodDays: Number(e.target.value) || null })
                    }
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">
                    Data provável de desbloqueio
                  </label>
                  <input
                    type="date"
                    value={editing.expectedUnlockAt ? editing.expectedUnlockAt.slice(0, 10) : ""}
                    onChange={(e) =>
                      onChangeField({
                        expectedUnlockAt: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    Se informar os dois, o período recalcula a data.
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-600">Observações</label>
                <textarea
                  rows={3}
                  value={editing.notes || ""}
                  onChange={(e) => onChangeField({ notes: e.target.value })}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              </div>

              {/* Histórico do registro (somente leitura) */}
              {editing.history.length > 0 && (
                <div className="rounded-lg border p-3">
                  <div className="mb-2 text-sm font-medium">Histórico anterior</div>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">
                    {editing.history.map((h, i) => (
                      <li key={i}>
                        {ciaLabel(h.cia)} — {fmtDate(h.startedAt)} →{" "}
                        {h.endedAt ? fmtDate(h.endedAt) : "—"}{" "}
                        {h.expectedUnlockAt ? `• prev: ${fmtDate(h.expectedUnlockAt)}` : ""}
                        {h.periodDays ? ` • ${h.periodDays} dias` : ""} {h.notes ? ` • ${h.notes}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                dialogRef.current?.close();
                setEditing(null);
              }}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button type="submit" className="rounded-xl bg-black px-4 py-2 text-sm text-white">
              Salvar
            </button>
          </div>
        </form>
      </dialog>

      <div className="mt-6 text-xs text-slate-500">
        Dica: use “Período (dias)” para calcular automaticamente a data provável de desbloqueio. Ao
        encerrar um bloqueio, o período final vai para o histórico do cedente.
      </div>
    </main>
  );
}
