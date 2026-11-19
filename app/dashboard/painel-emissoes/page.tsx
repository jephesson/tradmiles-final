// app/dashboard/painel-emissoes/page.tsx

import { cookies } from "next/headers";
import PainelEmissoesClient from "./PainelEmissoesClient";
import { readSessionCookie } from "@/lib/session";
import { VIEW_AS_EMISSOR_COOKIE, viewAsForRole } from "@/lib/viewAsEmissor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function getOne(sp: SP, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] || "" : v || "";
}

function normalizeProgram(v: string) {
  const p = String(v || "").toLowerCase().trim();
  return p === "latam" || p === "smiles" || p === "livelo" || p === "esfera"
    ? p
    : "latam";
}

export default async function Page({ searchParams }: { searchParams: SP }) {
  const program = normalizeProgram(getOne(searchParams, "programa"));
  const store = await cookies();
  const sess = readSessionCookie(store.get("tm.session")?.value);
  const preview = viewAsForRole(sess?.role, store.get(VIEW_AS_EMISSOR_COOKIE)?.value);
  return <PainelEmissoesClient initialProgram={program} readOnly={sess?.role === "emissor" || Boolean(preview)} />;
}
