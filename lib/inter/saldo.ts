import { interConfig } from "@/lib/inter/config";
import { interHttp } from "@/lib/inter/http";
import { interAccessToken } from "@/lib/inter/oauth";

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

export type InterSaldo = {
  availableCents: number;
  blockedCents: number;
  limitCents: number;
};

export async function fetchInterSaldo(): Promise<InterSaldo> {
  const cfg = interConfig();
  const token = await interAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (cfg.conta) headers["x-conta-corrente"] = cfg.conta;

  const res = await interHttp({
    method: "GET",
    url: `${cfg.bankingBase}/saldo`,
    headers,
  });

  const data = (res.json || {}) as {
    disponivel?: unknown;
    saldoDisponivel?: unknown;
    bloqueadoCheque?: unknown;
    bloqueadoJudicialmente?: unknown;
    bloqueadoAdministrativo?: unknown;
    limite?: unknown;
    message?: string;
    title?: string;
    detalhe?: string;
    violacoes?: { razao?: string }[];
  };

  if (!res.status || res.status >= 400) {
    const viol = (data.violacoes || [])
      .map((v) => v.razao)
      .filter(Boolean)
      .join("; ");
    throw new Error(
      (
        viol ||
        data.detalhe ||
        data.message ||
        data.title ||
        res.text ||
        `Inter HTTP ${res.status}`
      ).slice(0, 400)
    );
  }

  const blocked =
    numReaisToCents(data.bloqueadoCheque) +
    numReaisToCents(data.bloqueadoJudicialmente) +
    numReaisToCents(data.bloqueadoAdministrativo);

  return {
    availableCents: numReaisToCents(data.disponivel ?? data.saldoDisponivel),
    blockedCents: blocked,
    limitCents: numReaisToCents(data.limite),
  };
}
