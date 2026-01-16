"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type Owner = { id: string; name: string; login: string };

const YEAR = 2026;

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;

  owner: Owner;

  smilesAprovado: number;
  smilesPendente: number;
  smilesTotalEsperado: number;

  // ✅ NOVO: passageiros (ano fixo 2026)
  passengersUsed2026: number; // quantos CPFs únicos já usou em 2026
  passengersLimit2026: number; // limite anual (ex.: 25)
  passengersRemaining2026: number; // disponível (limit - used)
};

type SortBy = "aprovado" | "esperado" | "disp2026";

function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf;
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function onlyDigitsToInt(v: string) {
  const n = Number(String(v || "").replace(/\D+/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function pillClassForRemaining(rem: number) {
  if (rem <= 0) return "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200";
  if (rem <= 3) return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200";
}

export default function CedentesVisualizarSmilesClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("aprovado");

  // edição inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (ownerId) params.set("ownerId", ownerId);

      // ✅ pede passageiros de 2026 no mesmo GET
      params.set("year", String(YEAR));

      const res = await fetch(`/api/cedentes/smiles?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) throw new Error(data?.error || "Falha ao carregar");

      setRows(data.rows || []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ownerId]);

  const owners = useMemo(() => {
    const map = new Map<string, Owner>();
    for (const r of rows) map.set(r.owner.id, r.owner);
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [rows]);

  const totals2026 = useMemo(() => {
    const used = rows.reduce((acc, r) => acc + (r.passengersUsed2026 || 0), 0);
    const rem = rows.reduce((acc, r) => acc + (r.passengersRemaining2026 || 0), 0);
    const lim = rows.reduce((acc, r) => acc + (r.passengersLimit2026 || 0), 0);
    return { used, rem, lim };
  }, [rows]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      if (sortBy === "aprovado") {
        const av = a.smilesAprovado;
        const bv = b.smilesAprovado;
        if (bv !== av) return bv - av;
      } else if (sortBy === "esperado") {
        const av = a.smilesTotalEsperado;
        const bv = b.smilesTotalEsperado;
        if (bv !== av) return bv - av;
      } else if (sortBy === "disp2026") {
        const av = a.passengersRemaining2026;
        const bv = b.passengersRemaining2026;
        if (bv !== av) return bv - av;
      }

      return a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR");
    });
    return list;
  }, [rows, sortBy]);

  function startEdit(r: Row) {
    setEditingId(r.id);
    setDraft(String(r.smilesAprovado ?? 0));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }

  async function saveEdit(id: string) {
    const newValue = onlyDigitsToInt(draft);
    if (!confirm(`Atualizar SMILES para ${fmtInt(newValue)}?`)) return;

    setSaving(true);
    try {
      const res = await fetch("/api/cedentes/smiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pontosSmiles: newValue }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao salvar.");

      setRows((prev) =>
        prev.map((r) =>
          r.id !== id
            ? r
            : {
                ...r,
                smilesAprovado: newValue,
                smilesTotalEsperado: (r.smilesPendente || 0) + newValue,
              }
        )
      );

      cancelEdit();
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cedentes • Smiles</h1>
          <p className="text-sm text-slate-500">
            Pontos aprovados, pendentes e total esperado (SMILES).{" "}
            <span className="ml-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              Passageiros {YEAR}: disponíveis = limite − usados
            </span>
          </p>

          {/* ✅ resumo 2026 */}
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              Limite (soma): <b>{fmtInt(totals2026.lim)}</b>
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
              Usados {YEAR}: <b>{fmtInt(totals2026.used)}</b>
            </span>
            <span className={cn("rounded-full px-2 py-1 font-semibold", pillClassForRemaining(totals2026.rem))}>
              Disponíveis {YEAR}: <b>{fmtInt(totals2026.rem)}</b>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className={cn("border rounded-lg px-4 py-2 text-sm", loading ? "opacity-60" : "hover:bg-slate-50")}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>

          <Link href="/dashboard/cedentes/visualizar?programa=latam" className="border rounded-lg px-4 py-2 text-sm hover:bg-slate-50">
            Ir para LATAM
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar..."
          className="border rounded-lg px-3 py-2 text-sm w-64"
        />

        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm min-w-[220px]"
        >
          <option value="">Todos responsáveis</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} (@{o.login})
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="border rounded-lg px-3 py-2 text-sm min-w-[260px]"
          title="Ordenar do maior para o menor"
        >
          <option value="aprovado">Ordenar: SMILES (aprovado) ↓</option>
          <option value="esperado">Ordenar: TOTAL esperado ↓</option>
          <option value="disp2026">Ordenar: DISPONÍVEL {YEAR} ↓</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="mt-4 border rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-slate-600">
                <th className="text-left font-semibold px-4 py-3 w-[380px]">NOME</th>
                <th className="text-left font-semibold px-4 py-3 w-[260px]">RESPONSÁVEL</th>

                <th className="text-right font-semibold px-4 py-3 w-[150px]">SMILES</th>
                <th className="text-right font-semibold px-4 py-3 w-[150px]">PENDENTES</th>
                <th className="text-right font-semibold px-4 py-3 w-[170px]">TOTAL ESPERADO</th>

                {/* ✅ NOVO */}
                <th className="text-right font-semibold px-4 py-3 w-[220px]">
                  PASSAGEIROS {YEAR}
                  <div className="text-[11px] font-normal text-slate-500">disp. (usados/limite)</div>
                </th>

                <th className="text-right font-semibold px-4 py-3 w-[220px]">AÇÕES</th>
              </tr>
            </thead>

            <tbody>
              {sortedRows.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={7}>
                    Nenhum resultado.
                  </td>
                </tr>
              ) : null}

              {sortedRows.map((r) => {
                const isEditing = editingId === r.id;
                const rem = Number(r.passengersRemaining2026 || 0);
                const used = Number(r.passengersUsed2026 || 0);
                const lim = Number(r.passengersLimit2026 || 0);

                return (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.nomeCompleto}</div>
                      <div className="text-xs text-slate-500">
                        {r.identificador} • CPF: {maskCpf(r.cpf)}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{r.owner.name}</div>
                      <div className="text-xs text-slate-500">@{r.owner.login}</div>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEditing ? (
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          className="border rounded-lg px-2 py-1 text-right w-[140px]"
                          inputMode="numeric"
                        />
                      ) : (
                        fmtInt(r.smilesAprovado)
                      )}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.smilesPendente)}</td>

                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.smilesTotalEsperado)}</td>

                    {/* ✅ NOVO */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="inline-flex flex-col items-end gap-1">
                        <span className={cn("rounded-full px-2 py-1 text-xs font-semibold", pillClassForRemaining(rem))}>
                          {fmtInt(rem)} disp.
                        </span>
                        <span className="text-xs text-slate-500">
                          {fmtInt(used)}/{fmtInt(lim)}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(r.id)}
                              disabled={saving}
                              className={cn("border rounded-lg px-3 py-1.5 text-sm", saving ? "opacity-60" : "hover:bg-slate-50")}
                            >
                              {saving ? "Salvando..." : "Salvar"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={saving}
                              className="border rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(r)} className="border rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50">
                              Editar SMILES
                            </button>
                            <Link href={`/dashboard/cedentes/visualizar/${r.id}`} className="border rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50">
                              Ver
                            </Link>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={7}>
                    Carregando...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
