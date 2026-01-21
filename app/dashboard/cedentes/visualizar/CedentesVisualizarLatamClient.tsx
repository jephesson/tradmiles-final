"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type Owner = { id: string; name: string; login: string };

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;

  owner: Owner;

  latamAprovado: number;
  latamPendente: number;
  latamTotalEsperado: number;

  passageirosUsadosAno: number;
  passageirosDisponiveisAno: number;

  latamBloqueado?: boolean;
  blockedPrograms?: Program[];
};

type SortBy = "aprovado" | "esperado";

function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf;
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function isLatamBlocked(r: Row) {
  if (typeof r.latamBloqueado === "boolean") return r.latamBloqueado;
  return (r.blockedPrograms || []).includes("LATAM");
}

function onlyDigitsToInt(v: string) {
  const n = Number(String(v || "").replace(/\D+/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export default function CedentesVisualizarLatamClient() {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const [sortBy, setSortBy] = useState<SortBy>("aprovado");
  const [hideBlocked, setHideBlocked] = useState(false);

  // ✅ inline edit (igual SMILES)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (ownerId) params.set("ownerId", ownerId);

      const res = await fetch(`/api/cedentes/latam?${params.toString()}`, {
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
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [rows]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = sortBy === "aprovado" ? a.latamAprovado : a.latamTotalEsperado;
      const bv = sortBy === "aprovado" ? b.latamAprovado : b.latamTotalEsperado;
      if (bv !== av) return bv - av;
      return a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR");
    });
    return list;
  }, [rows, sortBy]);

  const visibleRows = useMemo(() => {
    if (!hideBlocked) return sortedRows;
    return sortedRows.filter((r) => !isLatamBlocked(r));
  }, [sortedRows, hideBlocked]);

  function startEdit(r: Row) {
    setEditingId(r.id);
    setDraft(String(r.latamAprovado ?? 0));
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }

  async function saveEdit(id: string) {
    const newValue = onlyDigitsToInt(draft);
    if (!confirm(`Atualizar LATAM (aprovado) para ${fmtInt(newValue)}?`)) return;

    setSaving(true);
    try {
      const res = await fetch("/api/cedentes/latam", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pontosLatam: newValue }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao salvar.");

      setRows((prev) =>
        prev.map((r) =>
          r.id !== id
            ? r
            : {
                ...r,
                latamAprovado: newValue,
                latamTotalEsperado: (r.latamPendente || 0) + newValue,
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
          <h1 className="text-2xl font-semibold">Cedentes • Latam</h1>
          <p className="text-sm text-slate-500">
            Pontos aprovados, pendentes, total esperado e passageiros disponíveis (ano).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className={cn(
              "border rounded-lg px-4 py-2 text-sm",
              loading ? "opacity-60" : "hover:bg-slate-50"
            )}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
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
          className="border rounded-lg px-3 py-2 text-sm min-w-[240px]"
          title="Ordenar do maior para o menor"
        >
          <option value="aprovado">Ordenar: LATAM (aprovado) ↓</option>
          <option value="esperado">Ordenar: TOTAL esperado ↓</option>
        </select>

        <label className="ml-1 inline-flex items-center gap-2 text-sm text-slate-700 select-none">
          <input
            type="checkbox"
            checked={hideBlocked}
            onChange={(e) => setHideBlocked(e.target.checked)}
          />
          Ocultar bloqueados
        </label>
      </div>

      {/* Tabela */}
      <div className="mt-4 border rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-slate-600">
                <th className="text-left font-semibold px-4 py-3 w-[380px]">NOME</th>
                <th className="text-left font-semibold px-4 py-3 w-[260px]">RESPONSÁVEL</th>
                <th className="text-right font-semibold px-4 py-3 w-[140px]">LATAM</th>
                <th className="text-right font-semibold px-4 py-3 w-[160px]">PENDENTES</th>
                <th className="text-right font-semibold px-4 py-3 w-[180px]">TOTAL ESPERADO</th>
                <th className="text-right font-semibold px-4 py-3 w-[190px]">PASSAGEIROS DISP.</th>
                <th className="text-right font-semibold px-4 py-3 w-[220px]">AÇÕES</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.length === 0 && !loading ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={7}>
                    Nenhum resultado.
                  </td>
                </tr>
              ) : null}

              {visibleRows.map((r) => {
                const blocked = isLatamBlocked(r);
                const isEditing = editingId === r.id;

                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-b last:border-b-0",
                      blocked ? "bg-red-50 text-red-700" : "",
                      blocked ? "hover:bg-red-100" : "hover:bg-slate-50"
                    )}
                    title={blocked ? "BLOQUEADO NA LATAM" : undefined}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-2">
                        <span>{r.nomeCompleto}</span>
                        {blocked ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide border border-red-300 rounded px-2 py-0.5">
                            Bloqueado
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={cn(
                          "text-xs",
                          blocked ? "text-red-600/80" : "text-slate-500"
                        )}
                      >
                        {r.identificador} • CPF: {maskCpf(r.cpf)}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{r.owner.name}</div>
                      <div
                        className={cn(
                          "text-xs",
                          blocked ? "text-red-600/80" : "text-slate-500"
                        )}
                      >
                        @{r.owner.login}
                      </div>
                    </td>

                    {/* ✅ LATAM inline edit */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEditing ? (
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          className={cn(
                            "border rounded-lg px-2 py-1 text-right w-[140px]",
                            blocked ? "border-red-300 bg-white" : ""
                          )}
                          inputMode="numeric"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(r.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                      ) : (
                        fmtInt(r.latamAprovado)
                      )}
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.latamPendente)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtInt(r.latamTotalEsperado)}</td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtInt(r.passageirosDisponiveisAno)}
                      <span
                        className={cn(
                          "text-xs",
                          blocked ? "text-red-600/80" : "text-slate-500"
                        )}
                      >
                        {" "}
                        (usados {fmtInt(r.passageirosUsadosAno)})
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => saveEdit(r.id)}
                              disabled={saving}
                              className={cn(
                                "border rounded-lg px-3 py-1.5 text-sm",
                                saving ? "opacity-60" : "hover:bg-slate-50"
                              )}
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
                            <button
                              onClick={() => startEdit(r)}
                              className={cn(
                                "border rounded-lg px-3 py-1.5 text-sm",
                                blocked ? "hover:bg-red-50" : "hover:bg-slate-50"
                              )}
                            >
                              Editar LATAM
                            </button>

                            <Link
                              href={`/dashboard/cedentes/visualizar/${r.id}`}
                              className={cn(
                                "border rounded-lg px-3 py-1.5 text-sm",
                                blocked ? "hover:bg-red-50" : "hover:bg-slate-50"
                              )}
                            >
                              Ver
                            </Link>

                            {/* opcional: manter seu botão antigo */}
                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/cedentes/${r.id}?edit=1`)}
                              className={cn(
                                "border rounded-lg px-3 py-1.5 text-sm",
                                blocked ? "hover:bg-red-50" : "hover:bg-slate-50"
                              )}
                              title="Abrir detalhe em modo edição para ajustar pontos"
                            >
                              Editar pontos
                            </button>
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
