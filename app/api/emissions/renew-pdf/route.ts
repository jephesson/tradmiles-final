import { NextRequest, NextResponse } from "next/server";
import { LoyaltyProgram } from "@prisma/client";
import { getSessionServer as getSession } from "@/lib/auth-server";
import { activeCedenteWhere } from "@/lib/cedentes/activeCedenteWhere";
import { prisma } from "@/lib/prisma";
import { EMISSION_LIMITS } from "@/lib/emissions";
import { loadEmissionsPanel } from "@/lib/emissions/panelData";
import { buildRenewPaxPdf } from "@/lib/emissions/buildRenewPaxPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseProgram(v: string | null): LoyaltyProgram | null {
  const s = String(v || "").trim().toUpperCase();
  if (s === "LATAM") return LoyaltyProgram.LATAM;
  if (s === "SMILES") return LoyaltyProgram.SMILES;
  if (s === "LIVELO") return LoyaltyProgram.LIVELO;
  if (s === "ESFERA") return LoyaltyProgram.ESFERA;
  const l = String(v || "").trim().toLowerCase();
  if (l === "latam") return LoyaltyProgram.LATAM;
  if (l === "smiles") return LoyaltyProgram.SMILES;
  if (l === "livelo") return LoyaltyProgram.LIVELO;
  if (l === "esfera") return LoyaltyProgram.ESFERA;
  return null;
}

function fmtCpf(raw: string) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length !== 11) return String(raw || "-");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const MONTHS_LONG = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function monthTitle(key: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const month = Number(m[2]);
  const label = MONTHS_LONG[month - 1] || key;
  return `${label} ${m[1]}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const program = parseProgram(req.nextUrl.searchParams.get("programa"));
    if (!program) {
      return NextResponse.json({ ok: false, error: "programa inválido." }, { status: 400 });
    }
    if (program !== LoyaltyProgram.LATAM) {
      return NextResponse.json(
        { ok: false, error: "A renovação de pax no mês vale para LATAM." },
        { status: 400 }
      );
    }

    const cedentes = await prisma.cedente.findMany({
      where: activeCedenteWhere({ owner: { team: session.team } }),
      select: { id: true, nomeCompleto: true, identificador: true, cpf: true },
    });
    const byId = new Map(cedentes.map((c) => [c.id, c]));
    const panel = await loadEmissionsPanel({
      team: session.team,
      program,
      months: 13,
      cedenteIds: cedentes.map((c) => c.id),
    });

    const paxLimit = EMISSION_LIMITS.LATAM;
    const rows = panel.rows
      .map((r) => {
        const c = byId.get(r.cedenteId);
        const renewPax = Math.max(0, Math.trunc(r.renewEndOfMonth || 0));
        const issuedThisMonth = Math.max(0, Math.trunc(r.perMonth[panel.currentMonthKey] || 0));
        const usedAfter = Math.max(0, Math.trunc(r.total || 0) - renewPax);
        return {
          nomeCompleto: c?.nomeCompleto || "—",
          identificador: c?.identificador || "—",
          cpf: fmtCpf(c?.cpf || ""),
          renewPax,
          issuedThisMonth,
          availableAfter: Math.max(0, paxLimit - usedAfter),
        };
      })
      .filter((r) => r.renewPax > 0)
      .sort((a, b) => {
        if (b.renewPax !== a.renewPax) return b.renewPax - a.renewPax;
        return a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR", { sensitivity: "base" });
      });

    const pdf = buildRenewPaxPdf({
      programLabel: "LATAM",
      monthLabel: monthTitle(panel.currentMonthKey),
      currentMonthKey: panel.currentMonthKey,
      renewMonthKey: panel.renewMonthKey,
      paxLimit,
      rows,
    });

    const fileName = `renovacao-pax-${panel.currentMonthKey}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    console.error("RENEW PAX PDF ERROR:", err);
    const message = err instanceof Error ? err.message : "Erro ao gerar PDF.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
