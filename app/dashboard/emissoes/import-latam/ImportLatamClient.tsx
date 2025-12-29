"use client";

import { useMemo, useState } from "react";

type DryRunResp = {
  ok: boolean;
  dryRun?: boolean;
  sheet?: string;
  program?: string;
  threshold?: number;
  monthsDetected?: Array<{ colIdx: number; label: string; issuedAt: string }>;
  plannedCount?: number;
  unmatchedCount?: number;
  unmatched?: Array<{
    excelName: string;
    bestScore: number;
    best?: { id: string; nomeCompleto: string; identificador: string };
  }>;
  samplePlanned?: Array<{
    cedenteId: string;
    issuedAt: string;
    passengersCount: number;
    note: string | null;
  }>;
  inserted?: number;
  error?: string;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtDateBR(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export default function ImportLatamClient() {
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState<string>("Contagem CPF");
  const [threshold, setThreshold] = useState<number>(0.9);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DryRunResp | null>(null);

  const canRun = useMemo(() => !!file && !loading, [file, loading]);

  async function callImport(dryRun: boolean) {
    if (!file) return alert("Selecione um arquivo .xlsx");
    setLoading(true);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("programa", "LATAM"); // fixo
      fd.append("sheetName", sheetName?.trim() || "");
      fd.append("threshold", String(threshold || 0.9));
      fd.append("dryRun", dryRun ? "true" : "false");

      const res = await fetch("/api/emissions/import-excel", {
        method: "POST",
        body: fd,
        cache: "no-store",
      });

      const json = (await res.json().catch(() => ({}))) as DryRunResp;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Falha ao importar.");
      }

      setResult(json);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || "Erro ao importar." });
      alert(e?.message || "Erro ao importar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Importar emissões — LATAM</h1>
          <p className="text-sm text-zinc-500">
            Converte a planilha “contagem por mês” em lançamentos. Cada mês vira um evento no <b>último dia do mês</b>.
          </p>
        </div>
      </div>

      {/* Card Upload */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-semibold">Arquivo Excel</h2>

        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs text-zinc-600">Selecionar .xlsx</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
            <div className="mt-1 text-xs text-zinc-500">
              {file ? (
                <>
                  <span className="font-medium text-zinc-700">{file.name}</span>{" "}
                  <span className="text-zinc-500">({Math.round(file.size / 1024)} KB)</span>
                </>
              ) : (
                "Nenhum arquivo selecionado."
              )}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-xs text-zinc-600">Aba (sheet)</label>
            <input
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Contagem CPF"
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
            <div className="mt-1 text-xs text-zinc-500">
              Deixe em branco para usar a primeira aba do arquivo.
            </div>
          </div>

          <div className="md:col-span-1">
            <label className="mb-1 block text-xs text-zinc-600">Match</label>
            <input
              type="number"
              min={0.5}
              max={1}
              step={0.01}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
            />
            <div className="mt-1 text-xs text-zinc-500">Sugestão: 0.90</div>
          </div>

          <div className="md:col-span-6 flex flex-wrap gap-2">
            <button
              disabled={!canRun}
              onClick={() => callImport(true)}
              className={cn(
                "h-10 rounded-xl border px-4 text-sm font-medium shadow-sm",
                canRun
                  ? "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  : "border-zinc-200 bg-zinc-100 text-zinc-400"
              )}
            >
              {loading ? "Processando…" : "Pré-visualizar (dry-run)"}
            </button>

            <button
              disabled={!canRun}
              onClick={() => {
                if (!confirm("Importar e GRAVAR no banco? (isso cria lançamentos)")) return;
                callImport(false);
              }}
              className={cn(
                "h-10 rounded-xl px-4 text-sm font-medium text-white shadow-sm",
                canRun ? "bg-zinc-900 hover:bg-zinc-800" : "bg-zinc-300"
              )}
            >
              {loading ? "Processando…" : "Importar (gravar)"}
            </button>

            <div className="ml-auto text-xs text-zinc-500 self-center">
              Endpoint:{" "}
              <span className="rounded bg-zinc-100 px-1 py-0.5">/api/emissions/import-excel</span>
            </div>
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Resultado</h2>
          {loading ? <span className="text-xs text-zinc-500">Carregando…</span> : null}
        </div>

        {!result ? (
          <div className="text-sm text-zinc-600">
            Rode um <b>dry-run</b> para validar meses detectados e matches antes de gravar.
          </div>
        ) : result.ok === false ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {result.error || "Erro."}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid gap-3 md:grid-cols-4">
              <Stat label="Programa" value={String(result.program || "LATAM")} />
              <Stat label="Aba" value={String(result.sheet || "—")} />
              <Stat label="Threshold" value={String(result.threshold ?? threshold)} />
              <Stat
                label={result.dryRun ? "Planejado" : "Inserido"}
                value={String(result.dryRun ? result.plannedCount ?? 0 : result.inserted ?? 0)}
                strong
              />
            </div>

            {/* Months */}
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 text-xs font-medium text-zinc-700">Meses detectados (linha 2 / colunas D..Q)</div>
              {result.monthsDetected?.length ? (
                <div className="flex flex-wrap gap-2">
                  {result.monthsDetected.map((m, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700"
                      title={m.issuedAt}
                    >
                      {m.label} → {fmtDateBR(m.issuedAt)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-zinc-600">Nenhum mês detectado.</div>
              )}
            </div>

            {/* Unmatched */}
            <div className="rounded-xl border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-200 p-3">
                <div>
                  <div className="text-sm font-semibold">Não encontrados</div>
                  <div className="text-xs text-zinc-500">
                    Linhas cujo nome do Excel não bateu com nenhum cedente acima do threshold.
                  </div>
                </div>
                <span className="text-xs text-zinc-600">
                  {result.unmatchedCount ?? result.unmatched?.length ?? 0}
                </span>
              </div>

              {(result.unmatched?.length || 0) === 0 ? (
                <div className="p-3 text-sm text-zinc-600">Nenhum. ✅</div>
              ) : (
                <div className="max-h-[320px] overflow-auto">
                  {result.unmatched!.map((u, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "grid grid-cols-1 gap-2 border-b border-zinc-100 p-3 md:grid-cols-3"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-500">Nome (Excel)</div>
                        <div className="truncate text-sm font-medium text-zinc-800">{u.excelName}</div>
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500">Melhor sugestão</div>
                        <div className="text-sm text-zinc-800">
                          {u.best ? (
                            <>
                              <span className="font-medium">{u.best.identificador}</span>{" "}
                              <span className="text-zinc-500">—</span>{" "}
                              <span>{u.best.nomeCompleto}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </div>
                      </div>

                      <div className="md:text-right">
                        <div className="text-xs text-zinc-500">Score</div>
                        <div className="text-sm font-medium text-zinc-800">
                          {(u.bestScore ?? 0).toFixed(3)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sample planned */}
            {result.dryRun ? (
              <div className="rounded-xl border border-zinc-200 bg-white">
                <div className="border-b border-zinc-200 p-3">
                  <div className="text-sm font-semibold">Amostra de lançamentos</div>
                  <div className="text-xs text-zinc-500">
                    Primeiros 50 eventos planejados (apenas para conferência).
                  </div>
                </div>

                {(result.samplePlanned?.length || 0) === 0 ? (
                  <div className="p-3 text-sm text-zinc-600">Nenhum evento planejado.</div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full min-w-[860px] border-separate border-spacing-0">
                      <thead>
                        <tr className="text-left text-xs text-zinc-500">
                          <th className="border-b border-zinc-200 p-2">CedenteId</th>
                          <th className="border-b border-zinc-200 p-2">Data (último dia)</th>
                          <th className="border-b border-zinc-200 p-2">Pax</th>
                          <th className="border-b border-zinc-200 p-2">Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.samplePlanned!.map((r, i) => (
                          <tr key={i} className="text-sm">
                            <td className="border-b border-zinc-100 p-2 font-mono text-xs text-zinc-700">
                              {r.cedenteId}
                            </td>
                            <td className="border-b border-zinc-100 p-2">{fmtDateBR(r.issuedAt)}</td>
                            <td className="border-b border-zinc-100 p-2 font-medium">{r.passengersCount}</td>
                            <td className="border-b border-zinc-100 p-2 text-zinc-700">
                              {r.note || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Importação concluída. Se você quiser evitar duplicidade numa segunda importação,
                eu ajusto a API para fazer <b>upsert</b> por mês/cedente.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="text-xs text-zinc-500">
        Dica: rode <b>dry-run</b> primeiro para ver “não encontrados”. Ajuste o threshold se necessário
        (ex.: 0.85) só se você confia no seu padrão de nomes.
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={cn("text-lg", strong && "font-semibold")}>{value}</div>
    </div>
  );
}
