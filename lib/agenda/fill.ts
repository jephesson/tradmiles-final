export function addMonthsYM(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1, 12, 0, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export function todayRecifeISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function ymLabelBR(ym: string) {
  const [y, m] = ym.split("-");
  return `${m}/${y}`;
}

/** Sem override: mês atual sempre aberto; o seguinte libera 10 dias antes do dia 1. */
export function defaultMonthFillOpen(ym: string, todayISO: string) {
  const currentYM = todayISO.slice(0, 7);
  if (ym === currentYM) return true;
  const nextYM = addMonthsYM(currentYM, 1);
  if (ym !== nextYM) return false;
  const unlock = new Date(`${nextYM}-01T12:00:00.000Z`);
  unlock.setUTCDate(unlock.getUTCDate() - 10);
  return todayISO >= unlock.toISOString().slice(0, 10);
}

export function fillWindowYMs(todayISO: string) {
  const currentYM = todayISO.slice(0, 7);
  return { currentYM, nextYM: addMonthsYM(currentYM, 1) };
}

export function isFillWindowMonth(ym: string, todayISO: string) {
  const { currentYM, nextYM } = fillWindowYMs(todayISO);
  return ym === currentYM || ym === nextYM;
}

/** Override: true = bloqueado, false = liberado, null = regra padrão. */
export function isFillOpenForUser(args: {
  ym: string;
  todayISO: string;
  adminLocked: boolean | null;
  isAdmin: boolean;
}) {
  if (!isFillWindowMonth(args.ym, args.todayISO)) return false;
  if (args.adminLocked === true) return args.isAdmin;
  if (args.adminLocked === false) return true;
  if (defaultMonthFillOpen(args.ym, args.todayISO)) return true;
  return args.isAdmin;
}

export function fillDeniedMessage(ym: string, todayISO: string, adminLocked: boolean | null) {
  if (adminLocked === true) {
    return `Preenchimento bloqueado para ${ymLabelBR(ym)}. Só o admin libera.`;
  }
  if (!isFillWindowMonth(ym, todayISO)) {
    return "Cadastro só é permitido neste mês ou no próximo.";
  }
  return `Cadastro ainda não liberado para ${ymLabelBR(ym)}.`;
}
