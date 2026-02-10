"use client";

import { useEffect, useMemo, useState } from "react";
import { TERMO_VERSAO } from "@/lib/termos";

type Owner = { id: string; name: string; login: string };

type Horarios = {
  turnoManha: boolean;
  turnoTarde: boolean;
  turnoNoite: boolean;
  updatedAt: string | null;
};

type Row = {
  id: string;
  nomeCompleto: string;
  cpf: string;
  owner: Owner;
  horarios: Horarios;
};

type TurnoKey = "turnoManha" | "turnoTarde" | "turnoNoite";

const TURNOS: { key: TurnoKey; label: string; hint: string }[] = [
  { key: "turnoManha", label: "Manhã", hint: "07–12" },
  { key: "turnoTarde", label: "Tarde", hint: "12–18" },
  { key: "turnoNoite", label: "Noite", hint: "18–22" },
];

function maskCpf(cpf: string) {
  const d = (cpf || "").replace(/\D+/g, "").slice(0, 11);
  if (d.length !== 11) return cpf || "—";
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function fmtUpdatedAt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

export default function HorarioBiometriaClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(
        `/api/cedentes/biometria-horarios?versao=${encodeURIComponent(TERMO_VERSAO)}`,
        { cache: "no-store" }
      );
      const j = await res.json().catch(() => ({}));

      if (!res.ok || !j?.ok) throw new Error(j?.error || "Falha ao carregar.");

      const items: Row[] = Array.isArray(j?.data?.items) ? j.data.items : [];
      setRows(items);
    } catch (e: any) {
      setRows([]);
      setErr(e?.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const t = `${r.nomeCompleto} ${r.cpf} ${r.owner?.name} ${r.owner?.login}`.toLowerCase();
      return t.includes(s);
    });
  }, [rows, q]);

  async function save(cedenteId: string, next: Horarios) {
    setSavingId(cedenteId);
    try {
      const res = await fetch("/api/cedentes/biometria-horarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedenteId,
          turnoManha: next.turnoManha,
          turnoTarde: next.turnoTarde,
          turnoNoite: next.turnoNoite,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Falha ao salvar.");

      const horarios: Horarios = j?.data?.horarios ?? next;

      setRows((prev) =>
        prev.map((r) => (r.id === cedenteId ? { ...r, horarios } : r))
      );
    } catch (e) {
      console.error("Falha ao salvar horários de biometria:", e);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Horário biometria</h1>
            <div className="text-sm text-zinc-600">
              Apenas cedentes com aceite LATAM = <b>Sim</b> (termo {TERMO_VERSAO})
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cedente ou responsável..."
              className="h-10 w-[320px] rounded border border-zinc-300 px-3 text-sm"
            />
            <button
              onClick={load}
              className="h-10 rounded bg-zinc-900 text-white px-4 text-sm"
            >
              Atualizar
            </button>
          </div>
        </div>

        {err && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
      </div>

      <div className="rounded border border-zinc-200 bg-white overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-zinc-50">
            <tr className="text-left">
              <th className="p-3">Cedente</th>
              <th className="p-3">Responsável</th>
              <th className="p-3">Turnos disponíveis</th>
              <th className="p-3">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={4}>
                  Carregando...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={4}>
                  Nenhum cedente encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const saving = savingId === r.id;
                return (
                  <tr key={r.id} className="border-t border-zinc-100">
                    <td className="p-3">
                      <div className="font-medium">{r.nomeCompleto}</div>
                      <div className="text-xs text-zinc-500">{maskCpf(r.cpf)}</div>
                    </td>

                    <td className="p-3">
                      <div className="font-medium">{r.owner?.name}</div>
                      <div className="text-xs text-zinc-500">@{r.owner?.login}</div>
                    </td>

                    <td className="p-3">
                      <div className="flex flex-col gap-2">
                        {TURNOS.map((t) => (
                          <label key={t.key} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={!!r.horarios?.[t.key]}
                              disabled={saving}
                              onChange={(e) =>
                                save(r.id, {
                                  ...r.horarios,
                                  [t.key]: e.target.checked,
                                })
                              }
                            />
                            <span>{t.label}</span>
                            <span className="text-xs text-zinc-500">({t.hint})</span>
                          </label>
                        ))}
                      </div>
                    </td>

                    <td className="p-3">
                      {saving ? (
                        <span className="text-xs text-zinc-500">Salvando...</span>
                      ) : (
                        <span className="text-xs text-zinc-500">
                          {fmtUpdatedAt(r.horarios?.updatedAt ?? null)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
