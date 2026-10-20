export type TelegramEmission = {
  origin: string;
  destination: string;
  outbound: string;
  inbound: string;
  trip: string;
  adt: number;
  chd: number;
  inf: number;
  expectedCount: number;
};

function isoToBr(iso: string) {
  const m = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || "").trim();
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function isPlausibleFlightDate(iso: string) {
  const y = Number(String(iso || "").slice(0, 4));
  const now = new Date().getFullYear();
  return Number.isFinite(y) && y >= now - 1 && y <= now + 2;
}

export function formatEmissionHint(e: TelegramEmission | null | undefined) {
  if (!e) return "";
  const orig = String(e.origin || "").trim().toUpperCase();
  const dest = String(e.destination || "").trim().toUpperCase();
  const outboundOk = isPlausibleFlightDate(e.outbound);
  const ida = outboundOk ? isoToBr(e.outbound) : "";
  const volta = outboundOk ? isoToBr(e.inbound) : "";
  const pax = Math.max(0, Number(e.expectedCount) || 0);
  const parts = [
    orig && dest && orig !== dest ? `Rota ${orig} → ${dest}` : "",
    ida ? `Ida ${ida}` : "",
    volta && String(e.trip || "").toUpperCase().includes("VOLTA") ? `Volta ${volta}` : "",
    pax ? `${pax} passageiro(s)` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function emissionExtractInstructions(e: TelegramEmission | null | undefined) {
  const hint = formatEmissionHint(e);
  if (!hint) {
    return "Extraia os passageiros da emissão mais recente no material.";
  }
  return `Emissão ATUAL: o bloco MAIS RECENTE de ficha de passageiro + print da busca LATAM.
${hint ? `Dica da tela (pode estar errada — o print do Telegram vale mais): ${hint}.` : ""}
Leia o print do voo (GRU, XAP, datas, ida/volta, adultos). Não use data de nascimento como data do voo.
Ignore "Parabéns, sua passagem foi emitida" e vendas anteriores. Não invente passageiro.`;
}
