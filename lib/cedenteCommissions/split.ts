export function cedenteShareCents(amountCents: number, employeeShareCents: number) {
  const total = Math.max(0, Math.trunc(Number(amountCents) || 0));
  const emp = Math.max(0, Math.trunc(Number(employeeShareCents) || 0));
  return Math.max(0, total - emp);
}

export function parseBRLToCents(raw: unknown) {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.round(raw > 1000 ? raw : raw * 100);
  }
  const s = String(raw)
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}
