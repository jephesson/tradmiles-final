// Helpers compartilhados: chips de e-mail (biblioteca / pin / alertas).

export type EmailProgramFilter = "ALL" | "SMILES" | "LATAM" | "LIVELO";
export type EmailSearchIn = "subject" | "anywhere";

export type EmailSavedFilter = {
  id: string;
  name: string;
  query: string;
  searchIn: EmailSearchIn;
  program: EmailProgramFilter;
};

/** Ação ao tratar o alerta (página de destino). */
export type EmailAlertAction = "VENDA" | "COMPRA" | "VISUALIZAR_PONTOS";
export type EmailAlertCia = "LATAM" | "SMILES" | "LIVELO";

export type EmailAlertActionConfig = {
  filterId: string;
  action: EmailAlertAction;
  cia: EmailAlertCia;
};

export const EMAIL_SAVED_FILTERS_KEY = "tm.emailSavedFilters";
export const EMAIL_PINNED_FILTER_IDS_KEY = "tm.emailPinnedFilterIds";
export const EMAIL_ALERT_FILTER_IDS_KEY = "tm.emailAlertFilterIds";
export const EMAIL_ALERT_ACTIONS_KEY = "tm.emailAlertActions";
export const EMAIL_DISMISSED_ALERTS_KEY = "tm.emailDismissedAlertIds";

const PROGRAMS = ["ALL", "SMILES", "LATAM", "LIVELO"] as const;
const ALERT_ACTIONS = ["VENDA", "COMPRA", "VISUALIZAR_PONTOS"] as const;
const ALERT_CIAS = ["LATAM", "SMILES", "LIVELO"] as const;

export const ALERT_ACTION_LABEL: Record<EmailAlertAction, string> = {
  VENDA: "Abrir venda",
  COMPRA: "Abrir compra",
  VISUALIZAR_PONTOS: "Abrir visualizar pontos",
};

export const ALERT_CIA_LABEL: Record<EmailAlertCia, string> = {
  LATAM: "LATAM",
  SMILES: "Smiles / GOL",
  LIVELO: "Livelo",
};

export function normalizeEmailFilter(
  f: Partial<EmailSavedFilter>
): EmailSavedFilter | null {
  if (!f?.id || !f?.name || typeof f.query !== "string") return null;
  return {
    id: String(f.id),
    name: String(f.name),
    query: String(f.query),
    searchIn: f.searchIn === "subject" ? "subject" : "anywhere",
    program: PROGRAMS.includes(f.program as EmailProgramFilter)
      ? (f.program as EmailProgramFilter)
      : "ALL",
  };
}

export function loadSavedEmailFilters(): EmailSavedFilter[] {
  try {
    const raw = localStorage.getItem(EMAIL_SAVED_FILTERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EmailSavedFilter[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEmailFilter)
      .filter((f): f is EmailSavedFilter => Boolean(f));
  } catch {
    return [];
  }
}

export function persistSavedEmailFilters(filters: EmailSavedFilter[]) {
  localStorage.setItem(EMAIL_SAVED_FILTERS_KEY, JSON.stringify(filters));
}

export function loadPinnedEmailFilterIds(): string[] {
  try {
    const raw = localStorage.getItem(EMAIL_PINNED_FILTER_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function persistPinnedEmailFilterIds(ids: string[]) {
  localStorage.setItem(EMAIL_PINNED_FILTER_IDS_KEY, JSON.stringify(ids));
}

export function loadAlertEmailFilterIds(): string[] {
  try {
    const raw = localStorage.getItem(EMAIL_ALERT_FILTER_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function persistAlertEmailFilterIds(ids: string[]) {
  localStorage.setItem(EMAIL_ALERT_FILTER_IDS_KEY, JSON.stringify(ids.slice(0, 20)));
}

function normalizeAlertActionConfig(
  raw: Partial<EmailAlertActionConfig>
): EmailAlertActionConfig | null {
  if (!raw?.filterId) return null;
  const action = ALERT_ACTIONS.includes(raw.action as EmailAlertAction)
    ? (raw.action as EmailAlertAction)
    : "VENDA";
  const cia = ALERT_CIAS.includes(raw.cia as EmailAlertCia)
    ? (raw.cia as EmailAlertCia)
    : "LATAM";
  return { filterId: String(raw.filterId), action, cia };
}

export function loadAlertActionConfigs(): EmailAlertActionConfig[] {
  try {
    const raw = localStorage.getItem(EMAIL_ALERT_ACTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EmailAlertActionConfig[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeAlertActionConfig)
      .filter((c): c is EmailAlertActionConfig => Boolean(c));
  } catch {
    return [];
  }
}

export function persistAlertActionConfigs(configs: EmailAlertActionConfig[]) {
  localStorage.setItem(EMAIL_ALERT_ACTIONS_KEY, JSON.stringify(configs.slice(0, 40)));
}

export function getAlertActionConfig(filterId: string): EmailAlertActionConfig {
  const found = loadAlertActionConfigs().find((c) => c.filterId === filterId);
  if (found) return found;
  return { filterId, action: "VENDA", cia: "LATAM" };
}

export function upsertAlertActionConfig(
  next: EmailAlertActionConfig
): EmailAlertActionConfig[] {
  const normalized = normalizeAlertActionConfig(next);
  if (!normalized) return loadAlertActionConfigs();
  const prev = loadAlertActionConfigs().filter((c) => c.filterId !== normalized.filterId);
  const merged = [...prev, normalized];
  persistAlertActionConfigs(merged);
  return merged;
}

export function removeAlertActionConfig(filterId: string) {
  const merged = loadAlertActionConfigs().filter((c) => c.filterId !== filterId);
  persistAlertActionConfigs(merged);
  return merged;
}

/** Monta o destino do botão de ação do alerta. */
export function buildAlertActionHref(
  config: EmailAlertActionConfig,
  opts?: { cedenteId?: string | null }
): string {
  const cedenteId = String(opts?.cedenteId || "").trim();
  const cia = config.cia.toLowerCase();

  if (config.action === "COMPRA") {
    const q = new URLSearchParams({ program: config.cia });
    if (cedenteId) q.set("cedenteId", cedenteId);
    return `/dashboard/compras/nova?${q}`;
  }

  if (config.action === "VISUALIZAR_PONTOS") {
    const q = new URLSearchParams({ programa: cia });
    if (cedenteId) q.set("q", cedenteId);
    return `/dashboard/cedentes/visualizar?${q}`;
  }

  const q = new URLSearchParams({ program: config.cia });
  if (cedenteId) q.set("cedenteId", cedenteId);
  return `/dashboard/vendas/nova?${q}`;
}

/** messageId → ISO dismissedAt */
export function loadDismissedAlertIds(): Record<string, string> {
  try {
    const raw = localStorage.getItem(EMAIL_DISMISSED_ALERTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") return {};
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const next: Record<string, string> = {};
    for (const [id, at] of Object.entries(parsed)) {
      const t = new Date(at).getTime();
      if (Number.isFinite(t) && t >= cutoff) next[id] = at;
    }
    return next;
  } catch {
    return {};
  }
}

export function persistDismissedAlertIds(map: Record<string, string>) {
  localStorage.setItem(EMAIL_DISMISSED_ALERTS_KEY, JSON.stringify(map));
}

export function dismissAlertMessage(messageId: string) {
  const map = loadDismissedAlertIds();
  map[messageId] = new Date().toISOString();
  persistDismissedAlertIds(map);
}
