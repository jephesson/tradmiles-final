"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
  createdAt: string;
  owner: { id: string; name: string; login: string };
};

function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat("pt-BR").format(n || 0);
  } catch {
    return String(n || 0);
  }
}

export default function CedentesVisualizarClient() {
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/cedentes/approved", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Falha ao carregar cedentes.");
      setRows(json.data as Row[]);
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

  const filtered = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      return (
        r.nomeCompleto.toLowerCase().includes(s) ||
        (r.owner?.name || "").toLowerCase().includes(s) ||
        (r.owner?.login || "").toLowerCase().includes(s) ||
        (r.cpf || "").includes(s) ||
        (r.identificador || "").toLowerCase().includes(s)
      );
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.latam += r.pontosLatam || 0;
        acc.smiles += r.pontosSmiles || 0;
        acc.livelo += r.pontosLivelo || 0;
        acc.esfera += r.pontosEsfera || 0;
        return acc;
      },
      { latam: 0, smiles: 0, livelo: 0, esfera: 0 }
    );
  }, [filtered]);

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cedentes • Todos</h1>
          <p className="text-sm text-slate-600">
            Lista de cedentes <b>aprovados</b> com pontos e responsável.
          </p>
        </div>

        <div className="flex gap-2">
          <input
            className="w-full md:w-80 rounded-xl border px-3 py-2 text-sm"
            placeholder="Buscar por nome, CPF, responsável..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            onClick={load}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            type="button"
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat title="Latam" value={fmtInt(totals.latam)} />
        <Stat title="Smiles" value={fmtInt(totals.smiles)} />
        <Stat title="Livelo" value={fmtInt(totals.livelo)} />
        <Stat title="Esfera" value={fmtInt(totals.esfera)} />
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium">
            {loading ? "Carregando..." : `${filtered.length} cedente(s) aprovado(s)`}
          </div>
          <div className="text-xs text-slate-500">Somente APPROVED</div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-600">Carregando lista…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">Nenhum cedente aprovado encontrado.</div>
        ) : (
          <div className="w-full overflow-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <Th>Nome</Th>
                  <Th>Responsável</Th>
                  <Th className="text-right">Latam</Th>
                  <Th className="text-right">Smiles</Th>
                  <Th className="text-right">Livelo</Th>
                  <Th className="text-right">Esfera</Th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t hover:bg-slate-50/60 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/dashboard/cedentes/${r.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/dashboard/cedentes/${r.id}`);
                      }
                    }}
                    title="Abrir detalhes do cedente"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.nomeCompleto}</div>
                      <div className="text-xs text-slate-500">
                        {r.identificador} • CPF: {r.cpf}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{r.owner?.name || "-"}</div>
                      <div className="text-xs text-slate-500">@{r.owner?.login || "-"}</div>
                    </td>

                    <TdRight>{fmtInt(r.pontosLatam)}</TdRight>
                    <TdRight>{fmtInt(r.pontosSmiles)}</TdRight>
                    <TdRight>{fmtInt(r.pontosLivelo)}</TdRight>
                    <TdRight>{fmtInt(r.pontosEsfera)}</TdRight>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 ${className}`}>
      {children}
    </th>
  );
}

function TdRight({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 text-right tabular-nums">{children}</td>;
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
