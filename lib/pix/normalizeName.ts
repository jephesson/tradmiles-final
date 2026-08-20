const STOP = new Set(["da", "de", "do", "das", "dos", "e"]);

export function normalizeName(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(s: string) {
  return normalizeName(s)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function sharedNameTokens(a: string, b: string) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return [] as string[];
  const setB = new Set(tb);
  return ta.filter((t) => setB.has(t));
}

/** Funcionário: exige primeiro nome igual ou 2+ tokens incluindo o primeiro. */
export function employeeNameMatch(a: string, b: string) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta[0] === tb[0]) return true;

  const common = sharedNameTokens(a, b);
  if (common.length >= 2 && common.includes(ta[0]!)) return true;
  if (common.length >= 2 && common.includes(tb[0]!)) return true;
  return false;
}

/** Heurística: 2 tokens em comum, 1 token forte (≥4 letras) ou primeiro+último. */
export function namesLikelyMatch(a: string, b: string) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;

  const common = sharedNameTokens(a, b);
  if (common.length >= 2) return true;
  if (common.some((t) => t.length >= 4)) return true;

  const firstA = ta[0];
  const lastA = ta[ta.length - 1];
  const firstB = tb[0];
  const lastB = tb[tb.length - 1];
  return firstA === firstB && lastA === lastB;
}
