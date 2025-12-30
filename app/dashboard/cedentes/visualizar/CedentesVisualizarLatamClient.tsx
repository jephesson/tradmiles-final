"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

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

export default function CedentesVisualizarLatamClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const [q, setQ] = useState("");
  const [ownerId, setOwnerId] = useState("");

  // ✅ novo: ordenação
  const [sortBy, setSortBy] = useState<SortBy>("aprovado");

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (ownerId) params.set("ownerId", ownerId);

      const res = await fetch(`/api/cedentes/latam?${params.toString()}`, {
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Falha ao carregar");

      const data = await res.json();
      setRows(data.rows || []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // load inicial
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounce do buscar
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

  // ✅ novo: ordena maior -> menor (aprovado ou esperado)
  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av =
        sortBy === "aprovado" ? a.latamAprovado : a.latamTotalEsperado;
      const bv =
        sortBy === "aprovado" ? b.latamAprovado : b.latamTotalEsperado;

      if (bv !== av) return bv - av; // desc

      // desempate: nome
      return a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR");
    });
    return list;
  }, [rows, sortBy]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Cedentes • Latam</h1>
          <p className="text-sm text-slate-500">
            Pontos aprovados, pendentes, total esperado e passageiros disponíveis
            (ano).
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

        {/* ✅ novo: ordenação */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="border rounded-lg px-3 py-2 text-sm min-w-[240px]"
          title="Ordenar do maior para o menor"
        >
          <option value="aprovado">Ordenar: LATAM (aprovado) ↓</option>
          <option value="esperado">Ordenar: TOTAL esperado ↓</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="mt-4 border rounded-xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-slate-600">
                <th className="text-left font-semibold px-4 py-3 w-[380px]">
                  NOME
                </th>
                <th className="text-left font-semibold px-4 py-3 w-[260px]">
                  RESPONSÁVEL
                </th>
                <th className="text-right font-semibold px-4 py-3 w-[140px]">
                  LATAM
                </th>
                <th className="text-right font-semibold px-4 py-3 w-[160px]">
                  PENDENTES
                </th>
                <th className="text-right font-semibold px-4 py-3 w-[180px]">
                  TOTAL ESPERADO
                </th>
                <th className="text-right font-semibold px-4 py-3 w-[190px]">
                  PASSAGEIROS DISP.
                </th>
                <th className="text-right font-semibold px-4 py-3 w-[140px]">
                  AÇÕES
                </th>
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

              {sortedRows.map((r) => (
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
                    {fmtInt(r.latamAprovado)}
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtInt(r.latamPendente)}
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtInt(r.latamTotalEsperado)}
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmtInt(r.passageirosDisponiveisAno)}
                    <span className="text-xs text-slate-500">
                      {" "}
                      (usados {fmtInt(r.passageirosUsadosAno)})
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Link
                        href={`/dashboard/cedentes/visualizar/${r.id}`}
                        className="border rounded-lg px-3 py-1.5 text-sm hover:bg-slate-50"
                      >
                        Ver
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

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
