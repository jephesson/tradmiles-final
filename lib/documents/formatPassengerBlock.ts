import type { ExtractedPassenger } from "./types";

function onlyDigits(s: string) {
  return String(s || "").replace(/\D/g, "");
}

function genderLabel(g: "M" | "F" | null | undefined) {
  if (g === "F") return "Feminino";
  if (g === "M") return "Masculino";
  return null;
}

/** Bloco de texto compatível com parsePassengerText / extensão LATAM. */
export function formatPassengerBlock(p: ExtractedPassenger): string {
  const lines: string[] = [];
  const name = String(p.fullName || "").trim();
  if (name) lines.push(name);

  if (p.birthDateBR) lines.push(`Nasc ${p.birthDateBR}`);

  const cpf = onlyDigits(p.cpf || "");
  if (cpf.length === 11) lines.push(`CPF ${cpf}`);
  else if (p.documentNumber?.trim()) {
    lines.push(`Doc ${p.documentNumber.trim()}`);
  }

  const sex = genderLabel(p.gender);
  if (sex) lines.push(`Sexo ${sex}`);

  return lines.join("\n");
}

export function formatPassengersForSale(passengers: ExtractedPassenger[]): string {
  return passengers
    .map(formatPassengerBlock)
    .filter(Boolean)
    .join("\n\n");
}

export function mergePassengerTexts(existing: string, extracted: string): string {
  const a = String(existing || "").trim();
  const b = String(extracted || "").trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}
