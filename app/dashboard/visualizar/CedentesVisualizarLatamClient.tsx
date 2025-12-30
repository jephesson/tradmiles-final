"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  pontosLatam: number;
  createdAt: string;
  owner: { id: string; name: string; login: string };
  blockedPrograms?: Program[];

  latamPendentes: number;
  latamPassageirosUsadosAno: number;
  latamPassageirosDisponiveisAno: number;
  latamLimiteAno: number;
  latamAno: number;
};

type SortKey = "nome" | "latam" | "pendentes" | "disp";
type SortDir = "asc" | "desc";

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function maskCpf(cpf: string) {
  const v = String(cpf || "").replace(/\D+/g, "");
  if (v.length !== 11) return cpf || "-";
  return `***.***.${v.slice(6, 9)}-${v.slice(9, 11)}`;
}

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

function isBlocked(r: Row, program: Program) {
  return (r.blockedPrograms || []).includes(program);
}

export default function CedentesVisualizarLatamClient() {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nome");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/cedentes/visualizar?programa=latam", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error);
      setRows(json.data || []);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => r.owner?.id && map.set(r.owner.id, r.owner.name));
    return Array.from(map.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (ownerFilter && r.owner?.id !== ownerFilter) return false;
        if (!s) return true;
        return (
          r.nomeCompleto.toLowerCase().includes(s) ||
          r.identificador.toLowerCase().includes(s) ||
          String(r.cpf || "").includes(s) ||
          r.owner?.name?.toLowerCase().includes(s)
        );
      })
      .sort((a, b) => {
        let va: number | string = "";
        let vb: number | string = "";

        switch (sortKey) {
          case "nome":
            va = a.nomeCompleto.toLowerCase();
            vb = b.nomeCompleto.toLowerCase();
            break;
          case "latam":
            va = a.pontosLatam;
            vb = b.pontosLatam;
            break;
          case "pendentes":
            va = a.latamPendentes;
            vb = b.latamPendentes;
            break;
          case "disp":
            va = a.latamPassageirosDisponiveisAno;
            vb = b.latamPassageirosDisponiveisAno;
            break;
        }

        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [rows, q, ownerFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "nome" ? "asc" : "desc");
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cedentes • LATAM</h1>
          <p className="text-sm text-slate-600">
            Pontos + Pendentes + Passageiros disponíveis (ano {rows[0]?.latamAno || new Date().getUTCFullYear()})
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-xl border px-3 py-2 text-sm"
            placeholder="Buscar..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="">Todos responsáveis</option>
            {owners.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          <button
            onClick={load}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            disabled={loading}
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <Th onClick={() => toggleSort("nome")}>Nome{arrow("nome")}</Th>
              <Th>Responsável</Th>

              <ThRight onClick={() => toggleSort("latam")}>LATAM{arrow("latam")}</ThRight>
              <ThRight onClick={() => toggleSort("pendentes")}>Pendentes{arrow("pendentes")}</ThRight>
              <ThRight onClick={() => toggleSort("disp")}>Disp.{arrow("disp")}</ThRight>

              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right">
                Ações
              </th>
            </tr>
          </thead>

          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-500">
                  Nenhum cedente encontrado.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const latamBlocked = isBlocked(r, "LATAM");

              return (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className={cn("font-medium", latamBlocked && "text-red-600")}>
                      {r.nomeCompleto}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.identificador} • CPF: {maskCpf(r.cpf)}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium">{r.owner?.name}</div>
                    <div className="text-xs text-slate-500">@{r.owner?.login}</div>
                  </td>

                  <TdRight className={latamBlocked ? "text-red-600 font-semibold" : ""}>
                    {fmtInt(r.pontosLatam)}
                  </TdRight>

                  <TdRight>{fmtInt(r.latamPendentes)}</TdRight>

                  <TdRight>
                    {fmtInt(r.latamPassageirosDisponiveisAno)}
                    <div className="text-[11px] text-slate-500">
                      usados: {fmtInt(r.latamPassageirosUsadosAno)} / {fmtInt(r.latamLimiteAno)}
                    </div>
                  </TdRight>

                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                      onClick={() => router.push(`/dashboard/cedentes/${r.id}`)}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading && <div className="mt-4 text-sm text-slate-500">Carregando…</div>}
    </div>
  );
}

function Th({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 cursor-pointer select-none"
    >
      {children}
    </th>
  );
}

function ThRight({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right cursor-pointer select-none"
    >
      {children}
    </th>
  );
}

function TdRight({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 text-right tabular-nums", className)}>{children}</td>;
}
