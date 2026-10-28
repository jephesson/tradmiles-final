import { createHash } from "node:crypto";
import { interConfig, interConfigured } from "@/lib/inter/config";
import { interHttp } from "@/lib/inter/http";
import { interAccessToken } from "@/lib/inter/oauth";
import type { ParsedPixEmail } from "@/lib/pix/types";

function formatInterError(status: number, json: unknown, text: string) {
  const data = (json || {}) as {
    message?: string;
    title?: string;
    titulo?: string;
    detail?: string;
    detalhe?: string;
    error?: string;
    violacoes?: { razao?: string; propriedade?: string }[];
  };
  const viol = (data.violacoes || [])
    .map((v) => [v.propriedade, v.razao].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("; ");
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  return (
    viol ||
    data.detalhe ||
    data.detail ||
    data.message ||
    data.titulo ||
    data.title ||
    data.error ||
    (raw && raw.length < 280 ? raw : "") ||
    `Inter HTTP ${status}`
  ).slice(0, 400);
}

function recifeISODate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function recifeDatePlusDays(iso: string, delta: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function numReaisToCents(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  const raw = String(v ?? "").trim().replace(/\s/g, "");
  if (!raw) return 0;
  if (raw.includes(",") && raw.includes(".")) {
    return Math.round(Number(raw.replace(/\./g, "").replace(",", ".")) * 100) || 0;
  }
  if (raw.includes(",")) {
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function str(v: unknown) {
  return String(v ?? "").trim();
}

function pickPayerName(tx: Record<string, unknown>) {
  const details =
    tx.detalhes && typeof tx.detalhes === "object" ? (tx.detalhes as Record<string, unknown>) : {};
  const raw =
    str(details.nomePagador) ||
    str(details.nomeRemetente) ||
    str(details.pagador) ||
    str(details.origem) ||
    str(tx.descricao) ||
    str(tx.titulo);
  return raw
    .replace(/^\s*(pix\s*(recebido|enviado)?\s*[-–:]?\s*)/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function txOccurredAt(tx: Record<string, unknown>) {
  const raw =
    str(tx.dataInclusao) ||
    str(tx.dataEntrada) ||
    str(tx.dataTransacao) ||
    str(tx.dataHora) ||
    recifeISODate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T15:00:00.000-03:00`;
  const d = new Date(raw.replace(" ", "T"));
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function txId(tx: Record<string, unknown>, idx: number) {
  const native =
    str(tx.idTransacao) ||
    str(tx.id) ||
    str(tx.codigoTransacao) ||
    str(tx.numeroDocumento);
  if (native) return `inter:${native}`;
  const hash = createHash("sha1")
    .update(
      [
        str(tx.dataTransacao) || str(tx.dataEntrada),
        str(tx.valor),
        str(tx.descricao),
        str(tx.tipoOperacao),
        String(idx),
      ].join("|")
    )
    .digest("hex")
    .slice(0, 16);
  return `inter:${hash}`;
}

export type InterIncomingPix = {
  id: string;
  occurredAt: string;
  amountCents: number;
  payerName: string | null;
  description: string;
  parsed: ParsedPixEmail;
};

type Cache = { key: string; at: number; rows: InterIncomingPix[] };
let cache: Cache | null = null;

async function authHeaders() {
  const cfg = interConfig();
  const token = await interAccessToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (cfg.conta) headers["x-conta-corrente"] = cfg.conta;
  return headers;
}

function mapCreditPix(tx: Record<string, unknown>, idx: number): InterIncomingPix | null {
  const tipoOp = str(tx.tipoOperacao || tx.operacao).toUpperCase();
  const tipoTx = str(tx.tipoTransacao || tx.tipo).toUpperCase();
  if (tipoOp && tipoOp !== "C") return null;
  if (tipoTx && tipoTx !== "PIX" && tipoTx !== "TRANSFERENCIA") return null;
  if (!tipoTx && !/pix/i.test(`${tx.titulo || ""} ${tx.descricao || ""}`)) return null;

  const amountCents = numReaisToCents(tx.valor);
  if (amountCents <= 0) return null;

  const payerName = pickPayerName(tx) || null;
  const description = str(tx.descricao) || str(tx.titulo) || "Pix recebido";
  const occurredAt = txOccurredAt(tx);

  return {
    id: txId(tx, idx),
    occurredAt,
    amountCents,
    payerName,
    description,
    parsed: {
      bank: "INTER",
      direction: "IN",
      amountCents,
      payerName,
      payeeAccount: null,
      confidence: payerName ? "high" : "medium",
      source: "regex",
    },
  };
}

async function fetchCompletoPage(args: {
  dataInicio: string;
  dataFim: string;
  pagina: number;
}) {
  const cfg = interConfig();
  const qs = new URLSearchParams({
    dataInicio: args.dataInicio,
    dataFim: args.dataFim,
    tipoOperacao: "C",
    pagina: String(args.pagina),
    tamanhoPagina: "100",
  });
  const res = await interHttp({
    method: "GET",
    url: `${cfg.bankingBase}/extrato/completo?${qs.toString()}`,
    headers: await authHeaders(),
  });
  return res;
}

async function fetchSimple(args: { dataInicio: string; dataFim: string }) {
  const cfg = interConfig();
  const qs = new URLSearchParams({
    dataInicio: args.dataInicio,
    dataFim: args.dataFim,
  });
  return interHttp({
    method: "GET",
    url: `${cfg.bankingBase}/extrato?${qs.toString()}`,
    headers: await authHeaders(),
  });
}

export async function fetchInterIncomingPix(args: { days: number }): Promise<InterIncomingPix[]> {
  if (!interConfigured()) return [];

  const days = Math.min(Math.max(Math.trunc(args.days || 3), 1), 14);
  const dataFim = recifeISODate();
  const dataInicio = recifeDatePlusDays(dataFim, -(days - 1));
  const key = `${dataInicio}:${dataFim}`;
  if (cache && cache.key === key && Date.now() - cache.at < 45_000) {
    return cache.rows;
  }

  let transacoes: Record<string, unknown>[] = [];
  const completo = await fetchCompletoPage({ dataInicio, dataFim, pagina: 0 });
  if (completo.status && completo.status < 400) {
    const data = (completo.json || {}) as {
      transacoes?: unknown;
      ultimaPagina?: boolean;
      totalPaginas?: number;
    };
    transacoes = Array.isArray(data.transacoes) ? (data.transacoes as Record<string, unknown>[]) : [];
    const totalPaginas = Math.min(Number(data.totalPaginas) || 1, 8);
    for (let pagina = 1; pagina < totalPaginas; pagina += 1) {
      const page = await fetchCompletoPage({ dataInicio, dataFim, pagina });
      if (!page.status || page.status >= 400) break;
      const body = (page.json || {}) as { transacoes?: unknown };
      if (Array.isArray(body.transacoes)) {
        transacoes.push(...(body.transacoes as Record<string, unknown>[]));
      }
    }
  } else {
    const simple = await fetchSimple({ dataInicio, dataFim });
    if (!simple.status || simple.status >= 400) {
      throw new Error(formatInterError(simple.status, simple.json, simple.text));
    }
    const data = (simple.json || {}) as { transacoes?: unknown };
    transacoes = Array.isArray(data.transacoes) ? (data.transacoes as Record<string, unknown>[]) : [];
  }

  const rows = transacoes
    .map((tx, idx) => mapCreditPix(tx, idx))
    .filter((row): row is InterIncomingPix => Boolean(row))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  cache = { key, at: Date.now(), rows };
  return rows;
}

export function findInterIncomingPix(rows: InterIncomingPix[], id: string) {
  const needle = String(id || "").trim();
  return rows.find((row) => row.id === needle) || null;
}
