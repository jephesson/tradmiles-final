export type AppRole = "admin" | "staff" | "socio" | "emissor";

export const SOCIO_PAGES = [
  {
    key: "dividas-cartoes",
    label: "Dívida cartões",
    path: "/dashboard/dividas-cartoes",
    apiPrefix: "/api/dividas-cartoes",
  },
] as const;

export type SocioPageKey = (typeof SOCIO_PAGES)[number]["key"];

export function parseRole(v: unknown): AppRole {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "admin") return "admin";
  if (s === "socio") return "socio";
  if (s === "emissor") return "emissor";
  return "staff";
}

export function isSocio(role: unknown) {
  return parseRole(role) === "socio";
}

export function socioHome(pages?: string[] | null) {
  const keys = new Set((pages || []).map((p) => String(p)));
  const first = SOCIO_PAGES.find((p) => keys.has(p.key));
  return first?.path || "/dashboard/dividas-cartoes";
}

export function socioCanVisit(pathname: string, pages?: string[] | null) {
  if (pathname.startsWith("/dashboard/conta")) return true;
  const keys = new Set((pages || []).map((p) => String(p)));
  return SOCIO_PAGES.some((p) => keys.has(p.key) && pathname.startsWith(p.path));
}

const SOCIO_API_ALWAYS = ["/api/auth", "/api/session", "/api/presence/ping", "/api/me"];

export function socioCanCallApi(pathname: string, pages?: string[] | null) {
  if (SOCIO_API_ALWAYS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  const keys = new Set((pages || []).map((p) => String(p)));
  return SOCIO_PAGES.some((p) => keys.has(p.key) && pathname.startsWith(p.apiPrefix));
}

/* =========================
 * Emissor: só emite passagens.
 * Vê Efetuar venda, Painel de emissões e Agenda; responde a um sócio (linkedSocioId).
 * ========================= */

export function isEmissor(role: unknown) {
  return parseRole(role) === "emissor";
}

export const EMISSOR_HOME = "/dashboard/vendas/nova";

const EMISSOR_PAGES = ["/dashboard/vendas/nova", "/dashboard/painel-emissoes", "/dashboard/agenda", "/dashboard/conta"];

export function emissorCanVisit(pathname: string) {
  return EMISSOR_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

type ApiRule = { prefix: string; exact?: boolean; methods?: string[] };

/** APIs que a Nova venda, o assistente de biometria, a extensão e o painel usam. */
const EMISSOR_API: ApiRule[] = [
  { prefix: "/api/auth" },
  { prefix: "/api/session" },
  { prefix: "/api/presence/ping" },
  { prefix: "/api/me" },
  { prefix: "/api/vendas", exact: true, methods: ["POST"] },
  { prefix: "/api/vendas/sugestoes", methods: ["GET"] },
  { prefix: "/api/vendas/latam-receipt", methods: ["POST"] },
  { prefix: "/api/cedentes/credentials", methods: ["GET"] },
  { prefix: "/api/cedentes/whatsapp", methods: ["GET"] },
  { prefix: "/api/cedentes/lite", methods: ["GET"] },
  { prefix: "/api/cedentes/approved", methods: ["GET"] },
  { prefix: "/api/clientes", methods: ["GET", "POST"] },
  { prefix: "/api/compras/liberadas", methods: ["GET"] },
  { prefix: "/api/emissions/panel", methods: ["GET"] },
  { prefix: "/api/emissions/renew-pdf", methods: ["GET"] },
  { prefix: "/api/funcionarios", exact: true, methods: ["GET"] },
  { prefix: "/api/funcionarios/payment-cards", methods: ["GET"] },
  { prefix: "/api/users/simple", methods: ["GET"] },
  { prefix: "/api/latam-extension" },
  { prefix: "/api/emails/verification-code" },
  { prefix: "/api/documents/extract" },
  { prefix: "/api/telegram" },
  { prefix: "/api/voarfacil" },
  // Agenda: o próprio turno, trocas e feriados (o que é só de admin a API já barra).
  { prefix: "/api/agenda" },
];

/** GET /api/cedentes/<id> (ficha do cedente escolhido na venda). */
const CEDENTE_BY_ID = /^\/api\/cedentes\/[^/]+$/;

export function emissorCanCallApi(pathname: string, method = "GET") {
  const m = String(method || "GET").toUpperCase();
  if (m === "GET" && CEDENTE_BY_ID.test(pathname)) return true;
  return EMISSOR_API.some((r) => {
    const hit = r.exact ? pathname === r.prefix : pathname === r.prefix || pathname.startsWith(`${r.prefix}/`);
    if (!hit) return false;
    return !r.methods || r.methods.includes(m) || m === "OPTIONS";
  });
}
