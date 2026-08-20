import { prisma } from "@/lib/prisma";
import { classifyAndMatchPix } from "./matchPixToPendingSales";
import { interpretPixEmailWithAI } from "./interpretPixEmailWithAI";
import { parsePixEmailText } from "./parsePixEmail";
import { normalizeName } from "./normalizeName";
import type { PixAlertRow, PixMatchResult, ParsedPixEmail } from "./types";

export async function loadPendingSales(team: string) {
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
      clienteId: true,
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
    clienteId: r.clienteId,
    clienteNome: r.cliente.nome,
    date: r.date,
    program: String(r.program),
  }));
}

export async function loadEmployees(team: string) {
  return prisma.user.findMany({
    where: { team, isActive: true },
    select: { id: true, name: true },
  });
}

export async function loadLearnedAliases(team: string) {
  try {
    const rows = await prisma.pixPayerAlias.findMany({
      where: { team },
      select: { payerNameNorm: true, clienteId: true },
    });
    return rows;
  } catch {
    return [];
  }
}

export async function rememberPayerAlias(args: {
  team: string;
  payerName: string;
  clienteId: string;
}) {
  const payerNameNorm = normalizeName(args.payerName);
  if (!payerNameNorm || payerNameNorm.length < 3) return;

  try {
    const existing = await prisma.pixPayerAlias.findFirst({
      where: { team: args.team, payerNameNorm },
    });
    if (existing) {
      await prisma.pixPayerAlias.update({
        where: { id: existing.id },
        data: { clienteId: args.clienteId, payerNameRaw: args.payerName },
      });
      return;
    }
    await prisma.pixPayerAlias.create({
      data: {
        team: args.team,
        payerNameNorm,
        payerNameRaw: args.payerName,
        clienteId: args.clienteId,
      },
    });
  } catch {
    /* tabela pode ainda não existir neste deploy */
  }
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
  if (parsed?.payerName && parsed.source === "regex" && useAi && /r\$/i.test(parsed.payerName)) {
    const ai = await interpretPixEmailWithAI(subject, body);
    if (ai?.payerName) parsed = { ...parsed, payerName: ai.payerName, source: "openai" };
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

  const [pendingSales, employees, learnedAliases] = await Promise.all([
    loadPendingSales(team),
    loadEmployees(team),
    loadLearnedAliases(team),
  ]);

  const match = classifyAndMatchPix({ parsed, pendingSales, employees, learnedAliases });
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
