"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PurchaseStatus = "OPEN" | "DRAFT" | "READY" | "CLOSED" | "CANCELED";
type LoyaltyProgram = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

/**
 * ✅ Compat: o backend pode devolver nomes diferentes dependendo do schema
 * então deixamos como "any shape" e normalizamos.
 */
type PurchaseRowRaw = {
  id: string;
  numero: string;
  status: PurchaseStatus;
  createdAt: string;

  // nomes possíveis (schema antigo/novo)
  ciaProgram?: LoyaltyProgram | null;
  ciaAerea?: LoyaltyProgram | null;

  ciaPointsTotal?: number;
  pontosCiaTotal?: number;

  totalCostCents?: number;
  totalCost?: number;
  totalCents?: number;

  cedente?: {
    id: string;
    nomeCompleto: string;
    cpf: string;
    identificador: string;
  } | null;
};

type PurchaseRow = {
  id: string;
  numero: string;
  status: PurchaseStatus;
  createdAt: string;

  ciaProgram: LoyaltyProgram | null;
  ciaPointsTotal: number;

  totalCostCents: number;

  cedente: {
    id: string;
    nomeCompleto: string;
    cpf: string;
    identificador: string;
  } | null;
};

function asInt(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeRow(r: PurchaseRowRaw): PurchaseRow {
  return {
    id: r.id,
    numero: r.numero,
    status: r.status,
    createdAt: r.createdAt,

    ciaProgram: (r.ciaProgram ?? r.ciaAerea ?? null) as any,
    ciaPointsTotal: asInt((r.ciaPointsTotal ?? r.pontosCiaTotal ?? 0) as any),

    totalCostCents: asInt(
      (r.totalCostCents ?? r.totalCost ?? r.totalCents ?? 0) as any
    ),

    cedente: r.cedente ?? null,
  };
}

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateBR(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
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
    console.error("API FAIL:", url, res.status, data);
    throw new Error(data?.error || `Erro ${res.status}`);
  }
  return data as T;
}

const STATUS_LABEL: Record<PurchaseStatus, string> = {
  OPEN: "Aberta",
  DRAFT: "Rascunho",
  READY: "Pronta",
  CLOSED: "Liberada",
  CANCELED: "Cancelada",
};

function StatusPill({ status }: { status: PurchaseStatus }) {
  const cls =
    status === "CLOSED"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : status === "CANCELED"
      ? "bg-red-50 border-red-200 text-red-700"
      : status === "READY"
      ? "bg-blue-50 border-blue-200 text-blue-700"
      : "bg-gray-50 border-gray-200 text-gray-700";

  return (
    <span className={`rounded-full border px-2 py-1 text-xs ${cls}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function norm(v?: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function onlyDigits(v?: string) {
  return (v || "").replace(/\D+/g, "");
}

export default function ComprasClient() {
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | PurchaseStatus>("");

  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    setErr(null);

    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (q.trim()) qs.set("q", q.trim());

      const out = await api<{ ok: true; compras: PurchaseRowRaw[] }>(
        `/api/compras?${qs.toString()}`
      );

      const list = Array.isArray(out.compras) ? out.compras : [];
      setRows(list.map(normalizeRow));
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar compras.");
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
    const needle = norm(q);
    const dig = onlyDigits(q);

    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (!needle && !dig) return true;

      const ced = r.cedente;

      const hay = [
        r.numero,
        r.id,
        r.ciaProgram || "",
        String(r.ciaPointsTotal || 0),
        fmtMoneyBR(r.totalCostCents || 0),
        ced?.nomeCompleto || "",
        ced?.cpf || "",
        ced?.identificador || "",
      ]
        .join(" ")
        .toLowerCase();

      if (dig.length >= 2) {
        const hayDigits = onlyDigits(hay);
        if (hayDigits.includes(dig)) return true;
      }
      return norm(hay).includes(needle);
    });
  }, [rows, q, status]);

  async function onRelease(id: string) {
    const okConfirm = window.confirm(
      "Liberar esta compra? Isso vai aplicar saldo e travar a compra."
    );
    if (!okConfirm) return;

    setBusyId(id);
    setErr(null);
    try {
      await api<{ ok: true }>(`/api/compras/${id}/liberar`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load({ silent: true });
    } catch (e: any) {
      setErr(e?.message || "Falha ao liberar.");
    } finally {
      setBusyId(null);
    }
  }

  // ✅ AJUSTE: fallback automático
  // 1) tenta POST /cancelar (se você criar essa rota)
  // 2) se der 404/405 -> usa DELETE /api/compras/:id (seu backend atual)
  async function onCancel(id: string) {
    const okConfirm = window.confirm(
      "Cancelar esta compra? (não deve alterar saldo se ainda não foi liberada)"
    );
    if (!okConfirm) return;

    setBusyId(id);
    setErr(null);

    try {
      try {
        await api<{ ok: true }>(`/api/compras/${id}/cancelar`, { method: "POST" });
      } catch (e: any) {
        const msg = String(e?.message || "");
        const isMethodOrRoute = msg.includes("Erro 404") || msg.includes("Erro 405");

        if (!isMethodOrRoute) throw e;

        // ✅ backend atual (o que você mostrou): DELETE no /api/compras/:id
        await api<{ ok: true }>(`/api/compras/${id}`, { method: "DELETE" });
      }

      await load({ silent: true });
    } catch (e: any) {
      setErr(e?.message || "Falha ao cancelar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Compras</h1>
          <p className="text-sm text-gray-600">
            Visualize, edite, libere ou cancele compras.
          </p>
        </div>

        <Link
          href="/dashboard/compras/nova"
          className="rounded-md bg-black px-3 py-2 text-sm text-white"
        >
          + Nova compra
        </Link>
      </div>

      <div className="rounded-xl border p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm text-gray-600">Buscar</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Número, nome, CPF, identificador..."
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="OPEN">Aberta</option>
              <option value="DRAFT">Rascunho</option>
              <option value="READY">Pronta</option>
              <option value="CLOSED">Liberada</option>
              <option value="CANCELED">Cancelada</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {loading ? "Carregando..." : "Aplicar filtros"}
            </button>

            <button
              type="button"
              onClick={() => {
                setQ("");
                setStatus("");
                setTimeout(() => void load(), 0);
              }}
              disabled={loading}
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
            >
              Limpar
            </button>
          </div>
        </div>
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
              <th className="p-3">Compra</th>
              <th className="p-3">Status</th>
              <th className="p-3">Cedente</th>
              <th className="p-3">CIA</th>
              <th className="p-3">Pts CIA</th>
              <th className="p-3">Total</th>
              <th className="p-3">Criada em</th>
              <th className="p-3"></th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="p-4 text-gray-500">
                  Nenhuma compra encontrada.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const isBusy = busyId === r.id;
              const isReleased = r.status === "CLOSED";
              const isCanceled = r.status === "CANCELED";

              return (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    <div className="font-mono">{r.numero}</div>
                    <div className="text-xs text-gray-500">{r.id}</div>
                  </td>

                  <td className="p-3">
                    <StatusPill status={r.status} />
                  </td>

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

                  <td className="p-3">{r.ciaProgram || "—"}</td>
                  <td className="p-3">
                    {(r.ciaPointsTotal || 0).toLocaleString("pt-BR")}
                  </td>
                  <td className="p-3 font-medium">{fmtMoneyBR(r.totalCostCents || 0)}</td>
                  <td className="p-3">{fmtDateBR(r.createdAt)}</td>

                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/compras/${r.id}`}
                        className="rounded-md border px-2 py-1 text-xs"
                      >
                        Editar
                      </Link>

                      <button
                        type="button"
                        onClick={() => void onRelease(r.id)}
                        disabled={isBusy || isReleased || isCanceled}
                        className="rounded-md bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        {isBusy ? "..." : "Liberar"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void onCancel(r.id)}
                        disabled={isBusy || isCanceled || isReleased}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                      >
                        {isBusy ? "..." : "Cancelar"}
                      </button>
                    </div>

                    {(isReleased || isCanceled) && (
                      <div className="mt-1 text-[11px] text-gray-500 text-right">
                        {isReleased ? "travada" : "cancelada"}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {loading && (
              <tr>
                <td colSpan={8} className="p-4 text-gray-500">
                  Carregando...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500">
        Dica: “Editar” abre a compra pelo ID. “Liberar” aplica saldo e trava.
      </div>
    </div>
  );
}
