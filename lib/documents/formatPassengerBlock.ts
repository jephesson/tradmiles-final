import type { ExtractedPassenger } from "./types";
import {
  extractCpfsFromSource,
  sortPassengersAdultChildInfant,
} from "@/lib/latam/parsePassengerText";

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
  if (p.email?.trim()) lines.push(p.email.trim());
  const phone = onlyDigits(p.phone || "");
  if (phone.length >= 10) lines.push(phone);

  return lines.join("\n");
}

export function formatPassengersForSale(passengers: ExtractedPassenger[]): string {
  return sortPassengersAdultChildInfant(passengers)
    .map(formatPassengerBlock)
    .filter(Boolean)
    .join("\n\n");
}

function passengerBlockKey(block: string) {
  const cpf = extractCpfsFromSource(block)[0];
  if (cpf) return `cpf:${cpf}`;
  const name = String(block || "")
    .split(/\n/)[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return name ? `n:${name}` : "";
}

function splitPassengerBlocks(text: string) {
  return String(text || "")
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

export function mergePassengerTexts(existing: string, extracted: string): string {
  const a = String(existing || "").trim();
  const b = String(extracted || "").trim();
  if (!a) return b;
  if (!b) return a;
  const blocks = [...splitPassengerBlocks(a), ...splitPassengerBlocks(b)];
  const byKey = new Map<string, string>();
  const order: string[] = [];
  for (const block of blocks) {
    const key = passengerBlockKey(block) || `raw:${block.slice(0, 80)}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, block);
      order.push(key);
      continue;
    }
    byKey.set(key, block.length >= prev.length ? block : prev);
  }
  return order.map((k) => byKey.get(k) || "").filter(Boolean).join("\n\n");
}
