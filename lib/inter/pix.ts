import { interConfig } from "@/lib/inter/config";
import { interHttp } from "@/lib/inter/http";
import { interAccessToken } from "@/lib/inter/oauth";

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

let lastPixAt = 0;
let pixQueue: Promise<void> = Promise.resolve();

function withPixRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const run = pixQueue.then(async () => {
    const wait = Math.max(0, lastPixAt + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastPixAt = Date.now();
    }
  });
  pixQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function authHeaders(extra?: Record<string, string>) {
  const cfg = interConfig();
  const token = await interAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(extra || {}),
  };
  if (cfg.conta) headers["x-conta-corrente"] = cfg.conta;
  return headers;
}

export type InterPixCreateResult = {
  tipoRetorno?: string;
  codigoSolicitacao?: string;
  dataPagamento?: string;
  dataOperacao?: string;
};

export async function createInterPixByKey(opts: {
  valorCents: number;
  descricao: string;
  pixTipo: string;
  pixKey: string;
  dataPagamento: string;
  idempotencyKey: string;
}): Promise<InterPixCreateResult> {
  const cfg = interConfig();
  const valor = Number((opts.valorCents / 100).toFixed(2));
  const body = {
    valor,
    dataPagamento: opts.dataPagamento,
    descricao: opts.descricao.slice(0, 140),
    destinatario: {
      tipo: "CHAVE",
      chave: opts.pixKey,
    },
  };

  return withPixRateLimit(async () => {
    const res = await interHttp({
      method: "POST",
      url: `${cfg.bankingBase}/pix`,
      headers: await authHeaders({ "x-id-idempotente": opts.idempotencyKey }),
      body: JSON.stringify(body),
    });
    const data = (res.json || {}) as InterPixCreateResult;
    if (res.status >= 400 || !data.codigoSolicitacao) {
      throw new Error(formatInterError(res.status, res.json, res.text));
    }
    return data;
  });
}

export type InterPixConsulta = {
  transacaoPix?: {
    status?: string;
    endToEnd?: string;
    codigoSolicitacao?: string;
    valor?: number;
    chave?: string;
    erros?: { codigo?: string; descricao?: string }[];
  };
  historico?: unknown[];
};

export async function getInterPix(codigoSolicitacao: string): Promise<InterPixConsulta> {
  const cfg = interConfig();
  const res = await interHttp({
    method: "GET",
    url: `${cfg.bankingBase}/pix/${encodeURIComponent(codigoSolicitacao)}`,
    headers: await authHeaders(),
  });
  if (res.status >= 400) {
    throw new Error(formatInterError(res.status, res.json, res.text));
  }
  return (res.json || {}) as InterPixConsulta;
}

export async function registerInterPixWebhook(webhookBaseUrl: string) {
  const cfg = interConfig();
  const webhookUrl = webhookBaseUrl.replace(/\/+$/, "");
  const res = await interHttp({
    method: "PUT",
    url: `${cfg.bankingBase}/webhooks/pix-pagamento`,
    headers: await authHeaders(),
    body: JSON.stringify({ webhookUrl }),
  });
  if (res.status !== 204 && res.status !== 200) {
    throw new Error(formatInterError(res.status, res.json, res.text));
  }
}
