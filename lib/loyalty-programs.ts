export const LOYALTY_PROGRAMS = ["LATAM", "SMILES", "LIVELO", "ESFERA", "IBERIA"] as const;
export type LoyaltyProgramCode = (typeof LOYALTY_PROGRAMS)[number];

export function isLoyaltyProgram(v: string | null | undefined): v is LoyaltyProgramCode {
  const up = String(v || "").trim().toUpperCase();
  return (LOYALTY_PROGRAMS as readonly string[]).includes(up);
}

export function parseLoyaltyProgram(v: string | null | undefined): LoyaltyProgramCode | null {
  const up = String(v || "").trim().toUpperCase();
  if (up === "GOL") return "SMILES";
  if (isLoyaltyProgram(up)) return up;
  return null;
}

export function programPointsField(program: string) {
  if (program === "LATAM") return "pontosLatam" as const;
  if (program === "SMILES") return "pontosSmiles" as const;
  if (program === "LIVELO") return "pontosLivelo" as const;
  if (program === "ESFERA") return "pontosEsfera" as const;
  if (program === "IBERIA") return "pontosIberia" as const;
  return null;
}

export function programPasswordField(program: string) {
  if (program === "LATAM") return "senhaLatamPass" as const;
  if (program === "SMILES") return "senhaSmiles" as const;
  if (program === "LIVELO") return "senhaLivelo" as const;
  if (program === "ESFERA") return "senhaEsfera" as const;
  if (program === "IBERIA") return "senhaIberia" as const;
  return null;
}

export function programRateField(program: string) {
  if (program === "LATAM") return "latamRateCents" as const;
  if (program === "SMILES") return "smilesRateCents" as const;
  if (program === "LIVELO") return "liveloRateCents" as const;
  if (program === "ESFERA") return "esferaRateCents" as const;
  if (program === "IBERIA") return "iberiaRateCents" as const;
  return "latamRateCents" as const;
}

export function programPrevistoField(program: string) {
  if (program === "LATAM") return "saldoPrevistoLatam";
  if (program === "SMILES") return "saldoPrevistoSmiles";
  if (program === "LIVELO") return "saldoPrevistoLivelo";
  if (program === "ESFERA") return "saldoPrevistoEsfera";
  if (program === "IBERIA") return "saldoPrevistoIberia";
  return null;
}

export function programAplicadoField(program: string) {
  if (program === "LATAM") return "saldoAplicadoLatam";
  if (program === "SMILES") return "saldoAplicadoSmiles";
  if (program === "LIVELO") return "saldoAplicadoLivelo";
  if (program === "ESFERA") return "saldoAplicadoEsfera";
  if (program === "IBERIA") return "saldoAplicadoIberia";
  return null;
}

export function programTitleCase(program: string) {
  if (program === "LATAM") return "Latam";
  if (program === "SMILES") return "Smiles";
  if (program === "LIVELO") return "Livelo";
  if (program === "ESFERA") return "Esfera";
  if (program === "IBERIA") return "Iberia";
  return program;
}
