export const DEFAULT_AFFILIATE_TEAM =
  process.env.AFFILIATE_DEFAULT_TEAM?.trim() || "@vias_aereas";

export const AFFILIATE_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type AffiliateStatus = (typeof AFFILIATE_STATUS)[keyof typeof AFFILIATE_STATUS];

export function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D+/g, "");
}

export function normalizeAffiliateLogin(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function slugifyAffiliateName(value: unknown) {
  const slug = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "afiliado";
}

function referralUrl(base: string, ref: string) {
  const url = new URL(base);
  url.searchParams.set("ref", ref);
  return url.toString();
}

export function buildAffiliateReferralLinks(ref: string) {
  const safeRef = slugifyAffiliateName(ref);
  const flightBase =
    process.env.AFFILIATE_FLIGHT_SALES_BASE_URL?.trim() ||
    "https://viasaereastrip.com.br/";
  const pointsBase =
    process.env.AFFILIATE_POINTS_PURCHASE_BASE_URL?.trim() ||
    "https://viasaereastrip.com.br/venda-seus-pontos";

  return {
    flightSalesLink: referralUrl(flightBase, safeRef),
    pointsPurchaseLink: referralUrl(pointsBase, safeRef),
  };
}
