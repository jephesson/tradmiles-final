import type { PixTipo } from "@prisma/client";

export function normalizePixKey(tipo: PixTipo | string, raw: string) {
  const t = String(tipo || "").toUpperCase();
  const s = String(raw || "").trim();
  if (t === "CPF" || t === "CNPJ") return s.replace(/\D/g, "");
  if (t === "TELEFONE") {
    const d = s.replace(/\D/g, "");
    if (d.startsWith("55")) return `+${d}`;
    return `+55${d}`;
  }
  if (t === "EMAIL") return s.toLowerCase();
  return s;
}

export function interTipoChave(tipo: PixTipo | string) {
  const t = String(tipo || "").toUpperCase();
  if (t === "ALEATORIA") return "ALEATORIA";
  if (t === "CPF" || t === "CNPJ" || t === "EMAIL" || t === "TELEFONE") return t;
  return "CHAVE";
}

export function pixKeyLooksValid(tipo: PixTipo | string, key: string) {
  const t = String(tipo || "").toUpperCase();
  if (t === "CPF") return key.length === 11;
  if (t === "CNPJ") return key.length === 14;
  if (t === "EMAIL") return key.includes("@");
  if (t === "TELEFONE") return key.replace(/\D/g, "").length >= 12;
  return key.length >= 8;
}
