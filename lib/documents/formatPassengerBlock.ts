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

function blockNameKey(block: string) {
  return String(block || "")
    .split(/\n/)
    .map((l) => l.trim())
    .find((l) => /[A-Za-zÀ-ÿ]{2,}/.test(l) && !/^(nasc|cpf|doc|tipo|sexo|e-?mail|tel)/i.test(l))
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^(?:pax|nome|passageir[oa])\s*[:\-–.]?\s*/i, "")
    .trim() || "";
}

function namesOverlap(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = a.split(" ").filter((t) => t.length > 1);
  const tb = b.split(" ").filter((t) => t.length > 1);
  if (ta.length < 2 || tb.length < 2) return false;
  const [sm, lg] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return sm.every((t) => lg.includes(t));
}

function passengerBlockKey(block: string) {
  const labeled = String(block || "").match(
    /\bcpf\b[^0-9]{0,16}(\d{3}\.?\d{3}\.?\d{3}[\-.]?\d{2}|\d{11})/i
  );
  const cpf = labeled
    ? String(labeled[1] || "").replace(/\D/g, "")
    : extractCpfsFromSource(block)[0];
  if (cpf && cpf.length === 11) return `cpf:${cpf}`;
  const name = blockNameKey(block);
  return name ? `n:${name}` : "";
}

function splitPassengerBlocks(text: string) {
  return String(text || "")
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

function pickRicherBlock(prev: string, next: string) {
  return next.length >= prev.length ? next : prev;
}

export function mergePassengerTexts(existing: string, extracted: string): string {
  const a = String(existing || "").trim();
  const b = String(extracted || "").trim();
  if (!a && !b) return "";
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
    byKey.set(key, pickRicherBlock(prev, block));
  }
  // Mesma pessoa com e sem CPF (cpf:x vs n:nome) → um bloco só.
  for (const key of [...order]) {
    if (!key.startsWith("n:")) continue;
    const name = key.slice(2);
    const cpfKey = order.find(
      (k) =>
        k.startsWith("cpf:") && namesOverlap(name, blockNameKey(byKey.get(k) || ""))
    );
    if (!cpfKey) continue;
    byKey.set(cpfKey, pickRicherBlock(byKey.get(cpfKey) || "", byKey.get(key) || ""));
    byKey.delete(key);
  }
  return order
    .map((k) => byKey.get(k) || "")
    .filter(Boolean)
    .join("\n\n");
}

export function dedupePassengerText(text: string): string {
  return mergePassengerTexts(String(text || "").trim(), "");
}
