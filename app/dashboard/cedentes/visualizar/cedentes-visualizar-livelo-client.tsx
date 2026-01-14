"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type ClubStatus = "ACTIVE" | "PAUSED" | "CANCELED" | "NEVER";

type CedenteRow = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;

  pontosLivelo: number;

  owner: { id: string; name: string; login: string };
  blockedPrograms?: Program[];
};

type ClubItem = {
  id: string;
  cedenteId: string;
  program: Program;
  tierK: number;
  status: "ACTIVE" | "PAUSED" | "CANCELED";
  subscribedAt: string;
};

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

function pillClass(status: ClubStatus) {
  if (status === "ACTIVE") return "border-green-200 bg-green-50 text-green-700";
  if (status === "PAUSED") return "border-yellow-200 bg-yellow-50 text-yellow-700";
  if (status === "CANCELED") return "border-red-200 bg-red-50 text-red-700";
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
}

function statusLabel(s: ClubStatus) {
  if (s === "NEVER") return "NUNCA";
  if (s === "ACTIVE") return "ATIVO";
  if (s === "PAUSED") return "PAUSADO";
  return "CANCELADO";
}

export default function CedentesVisualizarLiveloClient() {
  const router = useRouter();

  const [rows, setRows] = useState<CedenteRow[]>([]);
  const [loading, setLoading] = useState(true);

  // clubes LIV ELO (último por cedente)
  const [clubByCedente, setClubByCedente] = useState<Map<string, ClubItem | null>>(new Map());

  // filtros
  const [q, setQ] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");

  // edição de pontos
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      // 1) cedentes
      const r1 = await fetch("/api/cedentes/approved", { cache: "no-store" });
      const j1 = await r1.json();
      if (!j1?.ok) throw new Error(j1?.error || "Falha ao carregar cedentes");

      const cedentes: CedenteRow[] = j1.data || [];
      setRows(cedentes);

      // 2) clubes LIVELO
      const r2 = await fetch("/api/clubes?program=LIVELO", { cache: "no-store" });
      const j2 = await r2.json().catch(() => null);

      const items: ClubItem[] = j2?.ok ? (j2.items || []) : [];

      // items já vem orderBy subscribedAt desc; pega o primeiro por cedente
      const map = new Map<string, ClubItem | null>();
      for (const it of items) {
        if (it.program !== "LIVELO") continue;
        if (!map.has(it.cedenteId)) map.set(it.cedenteId, it);
      }

      // completa com null para quem não tem clube
      for (const c of cedentes) {
        if (!map.has(c.id)) map.set(c.id, null);
      }

      setClubByCedente(map);

      // limpa edição
      setEditingId(null);
      setDraftPoints("");
      setSavingId(null);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar.");
      setRows([]);
      setClubByCedente(new Map());
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

    return rows.filter((r) => {
      if (ownerFilter && r.owner?.id !== ownerFilter) return false;
      if (!s) return true;

      return (
        r.nomeCompleto.toLowerCase().includes(s) ||
        r.identificador.toLowerCase().includes(s) ||
        String(r.cpf || "").includes(s) ||
        r.owner?.name?.toLowerCase().includes(s)
      );
    });
  }, [rows, q, ownerFilter]);

  function clubStatus(r: CedenteRow): ClubStatus {
    const c = clubByCedente.get(r.id) || null;
    return (c?.status as any) || "NEVER";
  }

  function clubTierLabel(r: CedenteRow) {
    const c = clubByCedente.get(r.id) || null;
    return c ? `${c.tierK}k` : "Nunca assinado";
  }

  async function savePoints(cedenteId: string) {
    const n = Number(String(draftPoints || "").replace(/\D+/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      alert("Pontos inválidos.");
      return;
    }

    setSavingId(cedenteId);
    try {
      const res = await fetch(`/api/cedentes/${cedenteId}/pontos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program: "LIVELO", points: Math.trunc(n) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao salvar pontos");

      setRows((prev) =>
        prev.map((r) => (r.id === cedenteId ? { ...r, pontosLivelo: json.points } : r))
      );

      setEditingId(null);
      setDraftPoints("");
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar pontos.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cedentes • Livelo</h1>
          <p className="text-sm text-slate-600">
            Pontos Livelo + status do clube + último tier (se não existir, “Nunca assinado”).
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
              <Th>Nome</Th>
              <Th>Responsável</Th>
              <ThRight>Pontos (LIVELO)</ThRight>
              <Th>Clube (último)</Th>
              <Th>Status clube</Th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right">
                Ações
              </th>
            </tr>
          </thead>

          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-500">
                  Nenhum cedente encontrado.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const s = clubStatus(r);
              const tier = clubTierLabel(r);

              return (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.nomeCompleto}</div>
                    <div className="text-xs text-slate-500">
                      {r.identificador} • CPF: {maskCpf(r.cpf)}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium">{r.owner?.name}</div>
                    <div className="text-xs text-slate-500">@{r.owner?.login}</div>
                  </td>

                  <td className="px-4 py-3 text-right tabular-nums">
                    {editingId === r.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <input
                          className="w-[140px] rounded-lg border px-2 py-1 text-sm text-right"
                          value={draftPoints}
                          onChange={(e) => setDraftPoints(e.target.value)}
                          inputMode="numeric"
                        />
                        <button
                          className="rounded-lg bg-black px-3 py-1 text-xs text-white disabled:opacity-60"
                          disabled={savingId === r.id}
                          onClick={() => savePoints(r.id)}
                          type="button"
                        >
                          {savingId === r.id ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          className="rounded-lg border px-3 py-1 text-xs hover:bg-white"
                          onClick={() => {
                            setEditingId(null);
                            setDraftPoints("");
                          }}
                          type="button"
                          disabled={savingId === r.id}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium">{fmtInt(r.pontosLivelo)}</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span className="font-medium">{tier}</span>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs border", pillClass(s))}
                      title={s === "NEVER" ? "Nunca assinado" : `LIVELO • ${s}`}
                    >
                      {statusLabel(s)}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                        onClick={() => router.push(`/dashboard/cedentes/${r.id}`)}
                      >
                        Ver
                      </button>

                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-slate-50"
                        onClick={() => {
                          setEditingId(r.id);
                          setDraftPoints(String(r.pontosLivelo || 0));
                        }}
                        disabled={savingId === r.id}
                      >
                        Editar pontos
                      </button>
                    </div>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
      {children}
    </th>
  );
}

function ThRight({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 text-right">
      {children}
    </th>
  );
}
