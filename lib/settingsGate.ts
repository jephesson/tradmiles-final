import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

/** Cookie httpOnly definido após acertar a pergunta de segurança (só admin). */
export const SETTINGS_GATE_COOKIE = "tm_settings_gate";
export const SETTINGS_GATE_VALUE = "1";

export const DEFAULT_SETTINGS_SECURITY_CITY = "Munique";

export function fallbackSettingsSecurityCity() {
  const raw = (process.env.SETTINGS_SECURITY_CITY || DEFAULT_SETTINGS_SECURITY_CITY).trim();
  return raw || DEFAULT_SETTINGS_SECURITY_CITY;
}

export function normalizeSettingsSecurityInput(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

export async function settingsSecurityCityFromDb() {
  const row = await prisma.settings.findUnique({
    where: { key: "default" },
    select: { securityCity: true },
  });
  const city = String(row?.securityCity || "").trim();
  return city || fallbackSettingsSecurityCity();
}

/** Resposta esperada (minúsculas, sem acentos). */
export async function expectedSettingsSecurityAnswerNormalized() {
  return normalizeSettingsSecurityInput(await settingsSecurityCityFromDb());
}

export function settingsGateOpen(req: NextRequest) {
  return req.cookies.get(SETTINGS_GATE_COOKIE)?.value === SETTINGS_GATE_VALUE;
}
