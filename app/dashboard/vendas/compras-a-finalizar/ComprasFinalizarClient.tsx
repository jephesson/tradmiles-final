"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  purchaseId: string;
  numero: string;
  cedente: { id: string; nomeCompleto: string; cpf: string; identificador: string } | null;

  purchaseTotalCents: number;
  salesTotalCents: number;
  saldoCents: number;

  pax: number;
  soldPoints: number;
  avgMilheiroCents: number;

  salesCount: number;
  lastSaleAt: string | null;

  sales: Array<{
    id: string;
    numero: string;
    date: string;
    program: string;
    points: number;
    passengers: number;
    totalCents: number;
    locator: string | null;
    paymentStatus: string;
  }>;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtInt(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}
function fmtDateBR(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR");
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  const text = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `Erro ${res.status}`);
  }
  return data as T;
}

export default function ComprasFinalizarClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());

      const out = await api<{ ok: true; rows: Row[]; needsMigration?: boolean }>(
        `/api/vendas/compras-a-finalizar?${qs.toString()}`
      );

      setRows(Array.isArray(out.rows) ? out.rows : []);
      setNeedsMigration(Boolean(out.needsMigration));
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar.");
      setRows([]);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((r) => {
      const hay = [
        r.numero,
        r.purchaseId,
        r.cedente?.nomeCompleto || "",
        r.cedente?.cpf || "",
        r.cedente?.identificador || "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(needle);
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    let compras = 0;
    let vendas = 0;
    let saldo = 0;
    for (const r of filtered) {
      compras += r.purchaseTotalCents || 0;
      vendas += r.salesTotalCents || 0;
      saldo += r.saldoCents || 0;
    }
    return { ids: filtered.length, compras, vendas, saldo };
  }, [filtered]);

  async function onFinalizar(purchaseId: string) {
    const ok = window.confirm("Finalizar esta compra? Isso grava os totais e trava como finalizada.");
    if (!ok) return;

    setBusyId(purchaseId);
    setErr(null);

    try {
      await api<{ ok: true }>(`/api/vendas/compras-finalizar`, {
        method: "PATCH",
        body: JSON.stringify({ purchaseId }),
      });

      await load({ silent: true });
      alert("Compra finalizada.");
    } catch (e: any) {
      setErr(e?.message || "Falha ao finalizar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Compras a finalizar</h1>
          <p className="text-sm text-gray-600">
            Agrupa por ID (compra LIBERADA). Mostra saldo e prévias. Expanda para ver histórico das vendas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {needsMigration && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ Parece que as colunas de finalização ainda não foram migradas no banco (finalizedAt/final*).
          Rode uma migration pra isso (abaixo te deixo os comandos).
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">IDs no filtro</div>
          <div className="mt-1 text-xl font-semibold">{fmtInt(totals.ids)}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Soma compras</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.compras)}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Soma vendas</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.vendas)}</div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-xs text-gray-500">Saldo (Vendas − Compras)</div>
          <div className="mt-1 text-xl font-semibold">{fmtMoneyBR(totals.saldo)}</div>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Buscar por cedente / ID..."
        />
      </div>

      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="overflow-auto rounded-xl border">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="p-3">#</th>
              <th className="p-3">Cedente</th>
              <th className="p-3">ID</th>
              <th className="p-3">Pax (ID)</th>
              <th className="p-3">Saldo</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="p-4 text-gray-500">
                  Nenhum resultado.
                </td>
              </tr>
            )}

            {filtered.map((r, idx) => {
              const isOpen = Boolean(open[r.purchaseId]);
              const isBusy = busyId === r.purchaseId;

              return (
                <>
                  <tr key={r.purchaseId} className="border-t">
                    <td className="p-3">{idx + 1}</td>

                    <td className="p-3">
                      {r.cedente ? (
                        <div className="space-y-0.5">
                          <div className="font-medium">{r.cedente.nomeCompleto}</div>
                          <div className="text-xs text-gray-500">
                            CPF {r.cedente.cpf} · {r.cedente.identificador}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>

                    <td className="p-3">
                      <div className="font-mono">{r.numero}</div>
                      <div className="text-xs text-gray-500">{r.purchaseId}</div>
                    </td>

                    <td className="p-3">
                      <div className="font-medium">{fmtInt(r.pax)}</div>
                      <div className="text-xs text-gray-500">
                        {fmtInt(r.salesCount)} venda(s)
                      </div>
                    </td>

                    <td className="p-3 font-medium">{fmtMoneyBR(r.saldoCents)}</td>

                    <td className="p-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setOpen((m) => ({ ...m, [r.purchaseId]: !isOpen }))}
                          className="rounded-md border px-2 py-1 text-xs"
                        >
                          {isOpen ? "Fechar" : "Ver"}
                        </button>

                        <button
                          type="button"
                          onClick={() => void onFinalizar(r.purchaseId)}
                          disabled={isBusy}
                          className="rounded-md bg-black px-2 py-1 text-xs text-white disabled:opacity-50"
                          title="Finaliza e grava os totais"
                        >
                          {isBusy ? "..." : "Finalizar"}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="border-t bg-slate-50">
                      <td colSpan={6} className="p-3">
                        <div className="text-xs text-gray-600 mb-2">
                          Compras: <b>{fmtMoneyBR(r.purchaseTotalCents)}</b> · Vendas:{" "}
                          <b>{fmtMoneyBR(r.salesTotalCents)}</b> · Milheiro médio:{" "}
                          <b>{fmtMoneyBR(r.avgMilheiroCents)}</b> · Última venda:{" "}
                          <b>{r.lastSaleAt ? fmtDateBR(r.lastSaleAt) : "—"}</b>
                        </div>

                        <div className="overflow-auto rounded-lg border bg-white">
                          <table className="min-w-[900px] w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr className="text-left">
                                <th className="p-2">Venda</th>
                                <th className="p-2">Data</th>
                                <th className="p-2">Programa</th>
                                <th className="p-2">Pts</th>
                                <th className="p-2">Pax</th>
                                <th className="p-2">Total</th>
                                <th className="p-2">Locator</th>
                                <th className="p-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.sales.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="p-3 text-gray-500">
                                    Sem vendas vinculadas a este ID.
                                  </td>
                                </tr>
                              ) : (
                                r.sales.map((s) => (
                                  <tr key={s.id} className="border-t">
                                    <td className="p-2 font-mono">{s.numero}</td>
                                    <td className="p-2">{fmtDateBR(s.date)}</td>
                                    <td className="p-2">{s.program}</td>
                                    <td className="p-2">{fmtInt(s.points)}</td>
                                    <td className="p-2">{fmtInt(s.passengers)}</td>
                                    <td className="p-2">{fmtMoneyBR(s.totalCents)}</td>
                                    <td className="p-2">{s.locator || "—"}</td>
                                    <td className="p-2">{s.paymentStatus}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}

            {loading && (
              <tr>
                <td colSpan={6} className="p-4 text-gray-500">
                  Carregando...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
