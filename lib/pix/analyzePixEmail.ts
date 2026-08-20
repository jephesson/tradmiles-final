import { prisma } from "@/lib/prisma";
import { classifyAndMatchPix } from "./matchPixToPendingSales";
import { interpretPixEmailWithAI } from "./interpretPixEmailWithAI";
import { parsePixEmailText } from "./parsePixEmail";
import type { PixAlertRow, PixMatchResult, ParsedPixEmail } from "./types";

async function loadPendingSales(team: string) {
  const rows = await prisma.sale.findMany({
    where: {
      paymentStatus: "PENDING",
      cedente: { owner: { team } },
    },
    select: {
      id: true,
      numero: true,
      locator: true,
      totalCents: true,
      date: true,
      program: true,
      cliente: { select: { nome: true } },
    },
    orderBy: { date: "desc" },
    take: 120,
  });

  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    locator: r.locator,
    totalCents: r.totalCents,
    clienteNome: r.cliente.nome,
    date: r.date,
    program: String(r.program),
  }));
}

async function loadEmployees(team: string) {
  const rows = await prisma.user.findMany({
    where: { team, isActive: true },
    select: { id: true, name: true },
  });
  return rows;
}

export async function analyzePixEmailContent(args: {
  team: string;
  subject: string;
  body: string;
  useAi?: boolean;
}): Promise<{ parsed: ParsedPixEmail | null; match: PixMatchResult }> {
  const { team, subject, body, useAi = true } = args;

  let parsed = parsePixEmailText(subject, body);
  if (!parsed && useAi) {
    parsed = await interpretPixEmailWithAI(subject, body);
  }

  const emptyMatch: PixMatchResult = {
    classification: "UNKNOWN",
    classificationLabel: "Não foi possível ler o Pix",
    suggestedSales: [],
    matchKind: "none",
    matchedTotalCents: 0,
    amountDiffCents: 0,
    employeeName: null,
  };

  if (!parsed) {
    return { parsed: null, match: emptyMatch };
  }

  const [pendingSales, employees] = await Promise.all([
    loadPendingSales(team),
    loadEmployees(team),
  ]);

  const match = classifyAndMatchPix({ parsed, pendingSales, employees });
  return { parsed, match };
}

export function buildPixAlertRow(args: {
  id: string;
  subject: string;
  snippet: string;
  date: string | null;
  parsed: ParsedPixEmail | null;
  match: PixMatchResult;
}): PixAlertRow {
  return {
    id: args.id,
    subject: args.subject,
    snippet: args.snippet,
    date: args.date,
    parsed: args.parsed,
    match: args.match,
  };
}
