import { extractIataList } from "@/lib/cotacao-passagens";

export type QuoteLeg = {
  miles?: number;
  feeCents?: number;
  depTime?: string;
  arrTime?: string;
};

export type QuoteCiaCell = {
  milheiroCents?: number;
  miles?: number;
  feeCents?: number;
  depTime?: string;
  arrTime?: string;
  ida?: QuoteLeg;
  volta?: QuoteLeg;
};

function iata(v: string) {
  return String(v || "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 3);
}

export function quoteLeg(cell: QuoteCiaCell | null | undefined, dir: "IDA" | "VOLTA"): QuoteLeg {
  if (!cell) return {};
  if (dir === "VOLTA") return cell.volta && typeof cell.volta === "object" ? cell.volta : {};
  if (cell.ida && typeof cell.ida === "object" && (cell.ida.miles || cell.ida.depTime || cell.ida.arrTime)) {
    return cell.ida;
  }
  return {
    miles: cell.miles,
    feeCents: cell.feeCents,
    depTime: cell.depTime,
    arrTime: cell.arrTime,
  };
}

export function mergeQuoteLeg(
  cell: QuoteCiaCell | null | undefined,
  dir: "IDA" | "VOLTA",
  patch: QuoteLeg
): QuoteCiaCell {
  const ida = { ...quoteLeg(cell, "IDA") };
  const volta = { ...quoteLeg(cell, "VOLTA") };
  const next = dir === "IDA" ? ida : volta;
  if (patch.miles != null) next.miles = patch.miles;
  if (patch.feeCents != null) next.feeCents = patch.feeCents;
  if (patch.depTime) next.depTime = patch.depTime;
  if (patch.arrTime) next.arrTime = patch.arrTime;
  return {
    milheiroCents: cell?.milheiroCents || 0,
    ida: dir === "IDA" ? next : ida,
    volta: dir === "VOLTA" ? next : volta,
  };
}

export function quoteTotals(cell: QuoteCiaCell | null | undefined, includeReturn: boolean) {
  const ida = quoteLeg(cell, "IDA");
  const volta = quoteLeg(cell, "VOLTA");
  const idaMiles = Math.max(0, Math.trunc(ida.miles || 0));
  const voltaMiles = includeReturn ? Math.max(0, Math.trunc(volta.miles || 0)) : 0;
  const idaFee = Math.max(0, Math.trunc(ida.feeCents || 0));
  const voltaFee = includeReturn ? Math.max(0, Math.trunc(volta.feeCents || 0)) : 0;
  return {
    idaMiles,
    voltaMiles,
    idaFee,
    voltaFee,
    miles: idaMiles + voltaMiles,
    feeCents: idaFee + voltaFee,
    ready: includeReturn ? idaMiles > 0 && voltaMiles > 0 : idaMiles > 0,
  };
}

export function inferQuoteDirection(opts: {
  includeReturn: boolean;
  origins: string;
  destinations: string;
  pageOrigin?: string;
  pageDest?: string;
  explicit?: string;
  cell?: QuoteCiaCell | null;
}): "IDA" | "VOLTA" {
  if (!opts.includeReturn) return "IDA";
  const o = iata(opts.pageOrigin || "");
  const d = iata(opts.pageDest || "");
  const originSet = extractIataList(opts.origins);
  const destSet = extractIataList(opts.destinations);
  const looksVolta = Boolean(o && d && destSet.includes(o) && originSet.includes(d));
  const looksIda = Boolean(o && d && originSet.includes(o) && destSet.includes(d));
  if (looksVolta && !looksIda) return "VOLTA";
  if (looksIda && !looksVolta) return "IDA";
  const e = String(opts.explicit || "").toUpperCase();
  if (e === "VOLTA" || e === "RETURN") return "VOLTA";
  if (e === "IDA" || e === "OUTBOUND") return "IDA";
  const idaMiles = quoteLeg(opts.cell, "IDA").miles || 0;
  const voltaMiles = quoteLeg(opts.cell, "VOLTA").miles || 0;
  if (idaMiles > 0 && !voltaMiles) return "VOLTA";
  return "IDA";
}
