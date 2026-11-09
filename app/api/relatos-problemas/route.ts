import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth-server";
import { PROBLEM_PROGRAMS, PROBLEM_SELECT, cleanProtocols, isProblemStatus } from "@/lib/problemReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const H = { "Cache-Control": "no-store" };
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: H });

/** Relatos de problemas da equipe (todos os status). */
export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return bad("Não autenticado.", 401);
  }
  const data = await prisma.problemReport.findMany({
    where: { team: session.team },
    orderBy: [{ problemDate: "desc" }, { createdAt: "desc" }],
    select: PROBLEM_SELECT,
    take: 2000,
  });
  return NextResponse.json({ ok: true, data }, { headers: H });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return bad("Não autenticado.", 401);
  }
  const body = await req.json().catch(() => null);
  const cedenteId = String(body?.cedenteId || "").trim();
  const problemDate = String(body?.problemDate || "").trim();
  const description = String(body?.description || "").trim().slice(0, 5000);
  const programRaw = String(body?.program || "").trim().toUpperCase();
  const status = body?.status ? String(body.status) : "ABERTO";
  const protocols = cleanProtocols(body?.protocols);

  if (!cedenteId) return bad("Escolha a conta.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(problemDate)) return bad("Data do problema inválida.");
  if (!description) return bad("Descreva o problema.");
  if (!isProblemStatus(status)) return bad("Status inválido.");
  const program = programRaw ? (PROBLEM_PROGRAMS as readonly string[]).includes(programRaw) ? programRaw : null : null;
  if (programRaw && !program) return bad("Programa inválido.");

  const ced = await prisma.cedente.findUnique({ where: { id: cedenteId }, select: { id: true } });
  if (!ced) return bad("Conta não encontrada.", 404);

  const row = await prisma.problemReport.create({
    data: {
      team: session.team,
      cedenteId,
      program: program as (typeof PROBLEM_PROGRAMS)[number] | null,
      problemDate,
      protocols,
      description,
      status,
      resolvedAt: status === "RESOLVIDO" ? new Date() : null,
      createdById: session.id,
    },
    select: PROBLEM_SELECT,
  });
  return NextResponse.json({ ok: true, data: row }, { headers: H });
}
