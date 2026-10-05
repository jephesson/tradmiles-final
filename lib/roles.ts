export type AppRole = "admin" | "staff" | "socio";

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
