import { prisma } from "@/lib/prisma";
import type { DespesaCategoria } from "@prisma/client";

export const DESPESA_CATEGORIAS: DespesaCategoria[] = [
  "OPERACIONAL",
  "ADMINISTRATIVO",
  "MARKETING",
  "TECNOLOGIA",
  "PESSOAL",
  "OUTROS",
];

export const DESPESA_CATEGORIA_LABEL: Record<DespesaCategoria, string> = {
  OPERACIONAL: "Operacional",
  ADMINISTRATIVO: "Administrativo",
  MARKETING: "Marketing",
  TECNOLOGIA: "Tecnologia",
  PESSOAL: "Pessoal",
  OUTROS: "Outros",
};

export function parseCategory(v: unknown): DespesaCategoria {
  const raw = String(v || "OPERACIONAL").toUpperCase();
  return DESPESA_CATEGORIAS.includes(raw as DespesaCategoria)
    ? (raw as DespesaCategoria)
    : "OPERACIONAL";
}

export function isValidMonthKey(month: string) {
  return /^\d{4}-\d{2}$/.test(month);
}

export function clampDayOfMonth(day: number, year: number, month: number) {
  const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(Math.max(Math.trunc(day) || 1, 1), Math.min(28, max));
}

export function dueDateForMonth(month: string, dayOfMonth: number) {
  const [yRaw, mRaw] = month.split("-");
  const year = Number(yRaw);
  const monthNum = Number(mRaw);
  if (!year || !monthNum) return null;

  const day = clampDayOfMonth(dayOfMonth, year, monthNum);
  return new Date(Date.UTC(year, monthNum - 1, day, 12, 0, 0));
}

export function fmtMonthPTBR(month: string) {
  if (!isValidMonthKey(month)) return month;
  const [y, m] = month.split("-");
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 15));
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export async function syncRecurringDespesas(team: string, month: string) {
  if (!isValidMonthKey(month)) return;

  const templates = await prisma.despesaRecorrente.findMany({
    where: { team, active: true },
  });

  for (const template of templates) {
    const existing = await prisma.despesa.findFirst({
      where: {
        team,
        referenceMonth: month,
        recurringId: template.id,
      },
    });

    if (existing) continue;

    await prisma.despesa.create({
      data: {
        team,
        referenceMonth: month,
        title: template.title,
        description: template.description,
        amountCents: template.amountCents,
        category: template.category,
        recurringId: template.id,
        dueDate: dueDateForMonth(month, template.dayOfMonth),
        status: "PENDING",
      },
    });
  }
}
