import type { PixTipo } from "@prisma/client";

export const PIX_TIPOS: PixTipo[] = ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"];

export function parsePixCadastro(body: { pixTipo?: unknown; chavePix?: unknown }):
  | { ok: true; skip: true }
  | { ok: true; skip: false; pixTipo: PixTipo | null; chavePix: string | null }
  | { ok: false; error: string } {
  const hasTipo = typeof body?.pixTipo === "string";
  const hasKey = typeof body?.chavePix === "string";
  if (!hasTipo && !hasKey) return { ok: true, skip: true };

  const rawKey = hasKey ? String(body.chavePix).trim() : "";
  if (!rawKey) {
    return { ok: true, skip: false, pixTipo: null, chavePix: null };
  }

  const pixTipo = String(body?.pixTipo || "CPF").toUpperCase() as PixTipo;
  if (!PIX_TIPOS.includes(pixTipo)) return { ok: false, error: "Tipo de PIX inválido." };
  const chavePix = normalizePixKey(pixTipo, rawKey);
  if (!pixKeyLooksValid(pixTipo, chavePix)) return { ok: false, error: "Chave PIX inválida." };
  return { ok: true, skip: false, pixTipo, chavePix };
}

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
