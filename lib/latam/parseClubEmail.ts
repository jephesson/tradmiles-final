/** Extrai dados do e-mail de confirmação do Clube LATAM Pass. */

export type LatamClubEmailExtract = {
  participantName: string | null;
  acquisitionDateISO: string | null;
  renewalDay: number | null;
  planName: string | null;
  miles: number | null;
  tierK: number | null;
  monthlyFeeCents: number | null;
  totalCents: number | null;
  discountCents: number | null;
  discountMonths: number | null;
  cardMasked: string | null;
};

const CLUB_TIERS = [1, 2, 3, 5, 7, 10, 12, 15, 20];

function stripHtml(raw: string) {
  return String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function field(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:\\-–]?\\s*([^\\n\\r]+)`,
      "i"
    );
    const m = text.match(re);
    if (m?.[1]) {
      const v = m[1].trim().replace(/\s{2,}/g, " ");
      if (v) return v;
    }
  }
  return null;
}

/** "392,48" ou "392.48" → centavos */
export function brMoneyToCents(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/[^\d,.-]/g, "")
    .trim();
  if (!cleaned) return null;

  let n: number;
  if (cleaned.includes(",")) {
    n = Number(cleaned.replace(/\./g, "").replace(",", "."));
  } else {
    n = Number(cleaned);
  }
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** "31/07/2026" → YYYY-MM-DD */
export function brDateToISO(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).trim().match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!m) return null;
  const dd = String(m[1]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  const yyyy = m[3];
  const iso = `${yyyy}-${mm}-${dd}`;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return iso;
}

export function milesToTierK(miles: number | null | undefined): number | null {
  const m = Number(miles);
  if (!Number.isFinite(m) || m <= 0) return null;
  const k = Math.round(m / 1000);
  if (CLUB_TIERS.includes(k)) return k;
  // vizinho mais próximo
  let best = CLUB_TIERS[0];
  let bestDiff = Math.abs(best - k);
  for (const t of CLUB_TIERS) {
    const diff = Math.abs(t - k);
    if (diff < bestDiff) {
      best = t;
      bestDiff = diff;
    }
  }
  return best;
}

function tierFromPlanName(plan: string | null): number | null {
  if (!plan) return null;
  const p = plan.toLowerCase();
  // Turbo costuma ser 10k
  if (/\bturbo\b/.test(p)) return 10;
  const m = p.match(/(\d+)\s*k\b/) || p.match(/\b(\d{1,2})\s*000\b/);
  if (m) {
    const k = Number(m[1]);
    if (CLUB_TIERS.includes(k)) return k;
  }
  return null;
}

export function looksLikeLatamClubEmail(raw: string): boolean {
  const t = stripHtml(raw).toLowerCase();
  return (
    t.includes("clube latam") ||
    t.includes("latam pass +") ||
    (t.includes("assinatura") && t.includes("latam pass")) ||
    t.includes("plano escolhido")
  );
}

export function parseLatamClubEmail(raw: string): LatamClubEmailExtract | null {
  const text = stripHtml(raw);
  if (!text || !looksLikeLatamClubEmail(text)) return null;

  const participantName = field(text, [
    "Nome do Participante",
    "Nome do participante",
  ]);
  const acquisitionDateISO = brDateToISO(
    field(text, [
      "Data de aquisição",
      "Data de aquisicao",
      "Data de adesão",
      "Data de adesao",
    ])
  );

  const planName = field(text, ["Plano escolhido", "Plano"]);
  const milesRaw = field(text, [
    "Quantidade de milhas",
    "Milhas",
    "Quantidade de milhas mensais",
  ]);
  const miles = milesRaw
    ? Number(String(milesRaw).replace(/\D+/g, "")) || null
    : null;

  const monthlyFeeCents = brMoneyToCents(
    field(text, ["Mensalidade", "Valor da mensalidade"])
  );
  const totalCents = brMoneyToCents(field(text, ["Valor total", "Total"]));
  const discountCents = brMoneyToCents(field(text, ["Desconto"]));

  const monthsRaw = field(text, [
    "Desconto válido por (meses)",
    "Desconto valido por (meses)",
    "Desconto válido por",
    "Desconto valido por",
  ]);
  let discountMonths: number | null = null;
  if (monthsRaw) {
    const only = Number(String(monthsRaw).replace(/\D+/g, ""));
    if (Number.isFinite(only) && only > 0 && only <= 36) discountMonths = only;
  }

  const cardMasked = field(text, [
    "Número do cartão",
    "Numero do cartao",
    "Cartão",
    "Cartao",
  ]);

  const tierK = milesToTierK(miles) || tierFromPlanName(planName) || 10;

  const renewalDay = acquisitionDateISO
    ? Number(acquisitionDateISO.slice(8, 10)) || null
    : null;

  return {
    participantName,
    acquisitionDateISO,
    renewalDay,
    planName,
    miles,
    tierK,
    monthlyFeeCents,
    totalCents,
    discountCents,
    discountMonths,
    cardMasked,
  };
}
