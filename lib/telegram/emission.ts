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

export function formatEmissionHint(e: TelegramEmission | null | undefined) {
  if (!e) return "";
  const orig = String(e.origin || "").trim().toUpperCase();
  const dest = String(e.destination || "").trim().toUpperCase();
  const ida = isoToBr(e.outbound);
  const volta = isoToBr(e.inbound);
  const pax = Math.max(0, Number(e.expectedCount) || 0);
  const parts = [
    orig || dest ? `Rota ${orig || "?"} → ${dest || "?"}` : "",
    ida ? `Ida ${ida}` : "",
    volta && String(e.trip || "").toUpperCase().includes("VOLTA") ? `Volta ${volta}` : "",
    pax ? `${pax} passageiro(s) (ADT ${e.adt || 0} CHD ${e.chd || 0} INF ${e.inf || 0})` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function emissionExtractInstructions(e: TelegramEmission | null | undefined) {
  const hint = formatEmissionHint(e);
  if (!hint) {
    return "Extraia os passageiros da emissão mais recente no material.";
  }
  return `Emissão ATUAL (única que vale): ${hint}.
Extraia SOMENTE este voo: origem/destino IATA, data ida (e volta se houver) e os passageiros (nome, nascimento, CPF).
Classifique ADT (≥12), CHD (2–11) e INF (<2) na data da ida.
Se o Telegram tiver fichas de outras emissões do mesmo dia, ignore. Não invente passageiro para completar a conta.`;
}
