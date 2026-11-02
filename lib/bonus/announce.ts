import { monthLabelPT } from "@/lib/bonus/monthlyBonus";
import { ATTENDANCE_BONUS_CENTS } from "@/lib/attendance/period";

export type AnnounceEmployee = {
  name: string;
  salesGoalCents: number;
  bonusCents: number;
  recruitGoalCount: number;
  recruitBonusCents: number;
};

function fmtBRL(cents: number) {
  return (Math.max(0, cents) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function firstName(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[0] || name || "—";
}

export function buildBonusWhatsAppText(args: {
  month: string;
  isActive: boolean;
  teamBonusActive?: boolean;
  salesBonusActive?: boolean;
  recruitBonusActive?: boolean;
  attendanceBonusActive?: boolean;
  revenueGoalCents: number;
  profitGoalCents: number;
  employees: AnnounceEmployee[];
}): string {
  const label = monthLabelPT(args.month);
  const teamOn = args.teamBonusActive !== false;
  const salesOn = args.salesBonusActive !== false;
  const recruitOn = args.recruitBonusActive !== false;
  const attendanceOn = args.attendanceBonusActive !== false;
  const lines: string[] = [
    `*Metas de bônus — ${label}*`,
    "",
    "O pagamento entra no *dia 1 do mês seguinte*, junto com as comissões.",
  ];

  let n = 1;

  if (teamOn) {
    lines.push(
      "",
      `*${n}) Meta da equipe*`,
      `• Faturamento: *${fmtBRL(args.revenueGoalCents)}*`,
      "  Se bater essa meta, o time divide 0,1% do faturamento (milhas + balcão, sem taxa).",
      `• Lucro líquido: *${fmtBRL(args.profitGoalCents)}*`,
      "  Se faturamento e lucro forem batidos, entra mais 0,1% do lucro no prêmio.",
      "  Distribuição: 30% melhor C2, 30% maior volume, 20% mais contas finalizadas com lucro, 20% igual para todos."
    );
    n += 1;
  }

  if (salesOn) {
    const sales = args.employees.filter((e) => e.salesGoalCents > 0 && e.bonusCents > 0);
    lines.push("", `*${n}) Meta individual de venda*`);
    n += 1;
    if (!sales.length) {
      lines.push("Sem meta individual neste mês.");
    } else {
      lines.push(
        "Só libera quem bater a *cota mínima* (milhas + balcão, sem taxa). Abaixo disso, zero. Acima, proporcional no dia 1 — se vender o dobro da cota, recebe o dobro."
      );
      for (const e of sales) {
        lines.push(
          `• ${firstName(e.name)}: cota *${fmtBRL(e.salesGoalCents)}* → *${fmtBRL(e.bonusCents)}*`
        );
      }
    }
  }

  if (recruitOn) {
    const recruit = args.employees.filter(
      (e) => e.recruitGoalCount > 0 && e.recruitBonusCents > 0
    );
    lines.push("", `*${n}) Recrutamento de cedentes*`);
    n += 1;
    if (!recruit.length) {
      lines.push("Sem meta de recrutamento neste mês.");
    } else {
      lines.push(
        "Contam só contas *aprovadas* e *não excluídas*, vinculadas ao funcionário naquele mês. Só libera quem bater a *cota mínima*; abaixo, zero; acima, proporcional."
      );
      for (const e of recruit) {
        const q = e.recruitGoalCount;
        const contas = q === 1 ? "1 conta" : `${q} contas`;
        lines.push(
          `• ${firstName(e.name)}: cota *${contas}* → *${fmtBRL(e.recruitBonusCents)}*`
        );
      }
    }
  }

  if (attendanceOn) {
    lines.push(
      "",
      `*${n}) Assiduidade*`,
      `Quem cumprir as horas do mês recebe *${fmtBRL(ATTENDANCE_BONUS_CENTS)}* no dia 1.`
    );
  }

  lines.push("", "Qualquer dúvida, chama no grupo.");
  return lines.join("\n");
}
