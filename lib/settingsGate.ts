import type { NextRequest } from "next/server";

/** Cookie httpOnly definido após acertar a pergunta de segurança (só admin). */
export const SETTINGS_GATE_COOKIE = "tm_settings_gate";
export const SETTINGS_GATE_VALUE = "1";

/** Resposta esperada (minúsculas, sem acentos). Padrão: Munique. Sobrescreva com SETTINGS_SECURITY_CITY. */
export function expectedSettingsSecurityAnswerNormalized() {
  const raw = (process.env.SETTINGS_SECURITY_CITY || "Munique").trim();
  return normalizeSettingsSecurityInput(raw);
}

export function normalizeSettingsSecurityInput(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

export function settingsGateOpen(req: NextRequest) {
  return req.cookies.get(SETTINGS_GATE_COOKIE)?.value === SETTINGS_GATE_VALUE;
}
