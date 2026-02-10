// app/dashboard/atualizacao-termos/ui/AtualizacaoTermosClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type Owner = { id: string; name: string; login: string };

type TermTri = "YES" | "NO" | "NO_RESPONSE" | null;
type RespTime = "H1" | "H2" | "H3" | "GT3" | null;

type Review = {
  aceiteOutros: TermTri;
  aceiteLatam: TermTri;
  exclusaoDef: TermTri;
  responseTime: RespTime;
  disponibilidadePoints: number;
  updatedAt: string;
};

type Row = {
  id: string;
  nomeCompleto: string;
  telefone: string | null;
  owner: Owner;
  review: Review | null;
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function brToE164WhatsApp(raw: string | null) {
  const d = onlyDigits(raw || "");
  if (!d) return null;
  // se já vier com 55 + DDD + número (13 dígitos)
  if (d.length === 13 && d.startsWith("55")) return d;
  // se vier só 11 dígitos (DDD + 9 dígitos)
  if (d.length === 11) return `55${d}`;
  // fallback: tenta usar como está
  return d.length >= 10 ? (d.startsWith("55") ? d : `55${d}`) : null;
}

function responseTimePoints(rt: RespTime) {
  if (rt === "H1") return 30;
  if (rt === "H2") return 20;
  if (rt === "H3") return 10;
  return 0; // GT3 ou null
}

function computeScore(review: Review | null) {
  if (!review) return 0;
  return responseTimePoints(review.responseTime) + (Number(review.disponibilidadePoints) || 0);
}

function isGreen(review: Review | null) {
  return !!review && review.aceiteOutros === "YES" && review.aceiteLatam === "YES";
}
function isRed(review: Review | null) {
  return !!review && review.exclusaoDef === "YES";
}

export default function AtualizacaoTermosClient({
  termoVersao,
  termoTexto,
}: {
  termoVersao: string;
  termoTexto: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/cedentes/termos?versao=${encodeURIComponent(termoVersao)}`, {
        cache: "no-store",
      });
      const j = await res.json().catch(() => ({}));

      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || "Falha ao carregar cedentes.");
      }

      setRows(j?.data || []);
    } catch (e: any) {
      setErr(e?.message || "Erro inesperado.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termoVersao]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      return (
        r.nomeCompleto.toLowerCase().includes(s) ||
        r.owner?.name?.toLowerCase().includes(s) ||
        r.owner?.login?.toLowerCase().includes(s)
      );
    });
  }, [rows, q]);

  async function save(cedenteId: string, patch: Partial<Review>) {
    setSavingId(cedenteId);

    const current = rows.find((r) => r.id === cedenteId);
    const merged: Review = {
      aceiteOutros: current?.review?.aceiteOutros ?? null,
      aceiteLatam: current?.review?.aceiteLatam ?? null,
      exclusaoDef: current?.review?.exclusaoDef ?? null,
      responseTime: current?.review?.responseTime ?? null,
      disponibilidadePoints: current?.review?.disponibilidadePoints ?? 0,
      updatedAt: current?.review?.updatedAt ?? new Date().toISOString(),
      ...patch,
    };

    try {
      const res = await fetch(`/api/cedentes/termos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedenteId,
          termoVersao,
          aceiteOutros: merged.aceiteOutros,
          aceiteLatam: merged.aceiteLatam,
          exclusaoDef: merged.exclusaoDef,
          responseTime: merged.responseTime,
          disponibilidadePoints: merged.disponibilidadePoints,
        }),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok || !j?.ok) {
        throw new Error(j?.error || "Falha ao salvar.");
      }

      const nextReview: Review = j?.data?.review ?? j?.data ?? merged;

      setRows((prev) =>
        prev.map((r) => (r.id === cedenteId ? { ...r, review: nextReview } : r))
      );
    } catch (e) {
      console.error("Falha ao salvar atualização de termos:", e);
    } finally {
      setSavingId(null);
    }
  }

  function scoreBar(score: number) {
    const max = 100; // 30 + 70
    const pct = Math.max(0, Math.min(100, Math.round((score / max) * 100)));
    return (
      <div className="w-full">
        <div className="h-2 w-full rounded bg-zinc-200 overflow-hidden">
          <div className="h-2 rounded bg-zinc-800" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-zinc-600 mt-1">{score}/100</div>
      </div>
    );
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  function makeWhatsAppUrl(row: Row) {
    const e164 = brToE164WhatsApp(row.telefone);
    if (!e164) return null;
    const msg = termoTexto; // se quiser, personalize com nome no início
    return `https://wa.me/${e164}?text=${encodeURIComponent(msg)}`;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-semibold">Atualização de Termos</h1>

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

        <div className="rounded border border-zinc-200 p-3 bg-white">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm text-zinc-700">
              <b>Versão do termo:</b> {termoVersao}
            </div>
            <div className="flex gap-2">
              <button
                className="h-9 rounded border border-zinc-300 px-3 text-sm"
                onClick={() => copyText(termoTexto)}
              >
                Copiar termo
              </button>
            </div>
          </div>
          <textarea
            className="mt-3 w-full min-h-[160px] rounded border border-zinc-200 p-3 text-sm"
            readOnly
            value={termoTexto}
          />
        </div>
      </div>

      <div className="rounded border border-zinc-200 bg-white overflow-x-auto">
        <table className="min-w-[1300px] w-full text-sm">
          <thead className="bg-zinc-50">
            <tr className="text-left">
              <th className="p-3">Cedente</th>
              <th className="p-3">Responsável</th>
              <th className="p-3">WhatsApp</th>

              <th className="p-3">1) Aceite (Livelo/Esfera/Smiles)</th>
              <th className="p-3">2) Aceite LATAM</th>
              <th className="p-3">3) Exclusão definitiva</th>
              <th className="p-3">4) Tempo p/ responder</th>
              <th className="p-3">5) Disponibilidade (0–70)</th>
              <th className="p-3 min-w-[140px]">6) Score (4+5)</th>
              <th className="p-3 min-w-[180px]">Ações</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={10}>
                  Carregando...
                </td>
              </tr>
            ) : err ? (
              <tr>
                <td className="p-4 text-red-600" colSpan={10}>
                  {err}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="p-4 text-zinc-600" colSpan={10}>
                  Nenhum cedente encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const review = r.review;
                const score = computeScore(review);

                const rowClass = isRed(review)
                  ? "bg-red-50"
                  : isGreen(review)
                  ? "bg-green-50"
                  : "";

                const wa = makeWhatsAppUrl(r);

                const saving = savingId === r.id;

                return (
                  <tr key={r.id} className={cn("border-t border-zinc-100", rowClass)}>
                    <td className="p-3">
                      <div className="font-medium">{r.nomeCompleto}</div>
                      <div className="text-xs text-zinc-500">{r.id}</div>
                    </td>

                    <td className="p-3">
                      <div className="font-medium">{r.owner?.name}</div>
                      <div className="text-xs text-zinc-500">@{r.owner?.login}</div>
                    </td>

                    <td className="p-3">
                      {wa ? (
                        <div className="flex flex-col gap-2">
                          <a
                            className="inline-flex items-center justify-center h-9 rounded bg-zinc-900 text-white px-3 text-sm"
                            href={wa}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Enviar termo
                          </a>
                          <button
                            className="h-9 rounded border border-zinc-300 px-3 text-sm"
                            onClick={() => copyText(wa)}
                          >
                            Copiar link
                          </button>
                        </div>
                      ) : (
                        <span className="text-zinc-400">Sem telefone</span>
                      )}
                    </td>

                    <td className="p-3">
                      <select
                        className="h-9 rounded border border-zinc-300 px-2"
                        value={review?.aceiteOutros ?? ""}
                        onChange={(e) =>
                          save(r.id, { aceiteOutros: (e.target.value || null) as any })
                        }
                      >
                        <option value="">—</option>
                        <option value="YES">Sim</option>
                        <option value="NO">Não</option>
                        <option value="NO_RESPONSE">Não respondeu</option>
                      </select>
                    </td>

                    <td className="p-3">
                      <select
                        className="h-9 rounded border border-zinc-300 px-2"
                        value={review?.aceiteLatam ?? ""}
                        onChange={(e) =>
                          save(r.id, { aceiteLatam: (e.target.value || null) as any })
                        }
                      >
                        <option value="">—</option>
                        <option value="YES">Sim</option>
                        <option value="NO">Não</option>
                        <option value="NO_RESPONSE">Não respondeu</option>
                      </select>
                    </td>

                    <td className="p-3">
                      <select
                        className="h-9 rounded border border-zinc-300 px-2"
                        value={review?.exclusaoDef ?? ""}
                        onChange={(e) =>
                          save(r.id, { exclusaoDef: (e.target.value || null) as any })
                        }
                      >
                        <option value="">—</option>
                        <option value="NO">Não</option>
                        <option value="YES">Sim</option>
                        <option value="NO_RESPONSE">Não respondeu</option>
                      </select>
                    </td>

                    <td className="p-3">
                      <select
                        className="h-9 rounded border border-zinc-300 px-2"
                        value={review?.responseTime ?? ""}
                        onChange={(e) =>
                          save(r.id, { responseTime: (e.target.value || null) as any })
                        }
                      >
                        <option value="">—</option>
                        <option value="H1">1h (30)</option>
                        <option value="H2">2h (20)</option>
                        <option value="H3">3h (10)</option>
                        <option value="GT3">&gt;3h (0)</option>
                      </select>
                    </td>

                    <td className="p-3">
                      <input
                        type="number"
                        min={0}
                        max={70}
                        className="h-9 w-24 rounded border border-zinc-300 px-2"
                        value={review?.disponibilidadePoints ?? 0}
                        onChange={(e) =>
                          save(r.id, { disponibilidadePoints: Number(e.target.value || 0) })
                        }
                      />
                    </td>

                    <td className="p-3 min-w-[140px]">{scoreBar(score)}</td>

                    <td className="p-3 min-w-[180px]">
                      <div className="flex flex-col items-start gap-2">
                        <button
                          className="h-9 rounded border border-zinc-300 px-3 text-sm"
                          disabled={saving}
                          onClick={() =>
                            save(r.id, {
                              aceiteOutros: "NO_RESPONSE",
                              aceiteLatam: "NO_RESPONSE",
                              exclusaoDef: "YES",
                              responseTime: "GT3",
                              disponibilidadePoints: 0,
                            } as any)
                          }
                        >
                          Não respondeu → excluir
                        </button>

                        {saving ? (
                          <span className="text-xs text-zinc-500">Salvando...</span>
                        ) : review?.updatedAt ? (
                          <span className="text-xs text-zinc-500">
                            Atualizado: {new Date(review.updatedAt).toLocaleString("pt-BR")}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">Sem registro</span>
                        )}
                      </div>
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
