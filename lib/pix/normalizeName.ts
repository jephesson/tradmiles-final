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

/** Heurística: 2 tokens em comum ou primeiro+último nome. */
export function namesLikelyMatch(a: string, b: string) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;

  const setB = new Set(tb);
  const common = ta.filter((t) => setB.has(t));
  if (common.length >= 2) return true;

  const firstA = ta[0];
  const lastA = ta[ta.length - 1];
  const firstB = tb[0];
  const lastB = tb[tb.length - 1];
  return firstA === firstB && lastA === lastB;
}
