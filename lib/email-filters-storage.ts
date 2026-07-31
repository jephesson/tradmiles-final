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
export type EmailAlertActionAudience = "ALL" | "SELECTED";

export type EmailAlertActionConfig = {
  filterId: string;
  action: EmailAlertAction;
  cia: EmailAlertCia;
  /** Quem vê o botão de ação (o alerta em si aparece para todos). */
  actionAudience: EmailAlertActionAudience;
  /** Quando actionAudience === "SELECTED". */
  actionUserIds: string[];
};

export const EMAIL_SAVED_FILTERS_KEY = "tm.emailSavedFilters";
export const EMAIL_PINNED_FILTER_IDS_KEY = "tm.emailPinnedFilterIds";
export const EMAIL_ALERT_FILTER_IDS_KEY = "tm.emailAlertFilterIds";
export const EMAIL_ALERT_ACTIONS_KEY = "tm.emailAlertActions";
/** Legacy global dismiss (migrado para por usuário). */
export const EMAIL_DISMISSED_ALERTS_KEY = "tm.emailDismissedAlertIds";
export const EMAIL_DISMISSED_ALERTS_BY_USER_KEY = "tm.emailDismissedAlertIdsByUser";

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
  const actionAudience: EmailAlertActionAudience =
    raw.actionAudience === "SELECTED" ? "SELECTED" : "ALL";
  const actionUserIds = Array.isArray(raw.actionUserIds)
    ? raw.actionUserIds.map(String).filter(Boolean)
    : [];
  return {
    filterId: String(raw.filterId),
    action,
    cia,
    actionAudience,
    actionUserIds,
  };
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
  return {
    filterId,
    action: "VENDA",
    cia: "LATAM",
    actionAudience: "ALL",
    actionUserIds: [],
  };
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

/** O alerta aparece para todos; o botão de ação só para quem estiver habilitado. */
export function canUserUseAlertAction(
  config: EmailAlertActionConfig,
  userId: string | null | undefined
): boolean {
  if (config.actionAudience !== "SELECTED") return true;
  const uid = String(userId || "").trim();
  if (!uid) return false;
  return config.actionUserIds.includes(uid);
}

/** Monta o destino do botão de ação do alerta. */
export function buildAlertActionHref(
  config: EmailAlertActionConfig,
  opts?: { cedenteId?: string | null; emailId?: string | null }
): string {
  const cedenteId = String(opts?.cedenteId || "").trim();
  const emailId = String(opts?.emailId || "").trim();
  const cia = config.cia.toLowerCase();

  if (config.action === "COMPRA") {
    const q = new URLSearchParams({ program: config.cia, fromAlert: "1" });
    if (cedenteId) q.set("cedenteId", cedenteId);
    if (emailId) q.set("emailId", emailId);
    return `/dashboard/compras/nova?${q}`;
  }

  if (config.action === "VISUALIZAR_PONTOS") {
    const q = new URLSearchParams({ programa: cia });
    if (cedenteId) q.set("q", cedenteId);
    return `/dashboard/cedentes/visualizar?${q}`;
  }

  const q = new URLSearchParams({ program: config.cia, fromAlert: "1" });
  if (cedenteId) q.set("cedenteId", cedenteId);
  if (emailId) q.set("emailId", emailId);
  return `/dashboard/vendas/nova?${q}`;
}

type DismissedByUser = Record<string, Record<string, string>>;

function pruneDismissedMap(map: Record<string, string>) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const next: Record<string, string> = {};
  for (const [id, at] of Object.entries(map)) {
    const t = new Date(at).getTime();
    if (Number.isFinite(t) && t >= cutoff) next[id] = at;
  }
  return next;
}

function loadDismissedByUserRaw(): DismissedByUser {
  try {
    const raw = localStorage.getItem(EMAIL_DISMISSED_ALERTS_BY_USER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DismissedByUser;
    if (!parsed || typeof parsed !== "object") return {};
    const out: DismissedByUser = {};
    for (const [userId, map] of Object.entries(parsed)) {
      if (!map || typeof map !== "object") continue;
      out[userId] = pruneDismissedMap(map);
    }
    return out;
  } catch {
    return {};
  }
}

function persistDismissedByUser(data: DismissedByUser) {
  localStorage.setItem(EMAIL_DISMISSED_ALERTS_BY_USER_KEY, JSON.stringify(data));
}

/**
 * Ignorar é por funcionário: o alerta some só para quem ignorou,
 * e continua aparecendo para os demais.
 */
export function loadDismissedAlertIds(userId?: string | null): Record<string, string> {
  const uid = String(userId || "").trim();
  if (!uid) {
    // fallback legado (antes do por-usuário)
    try {
      const raw = localStorage.getItem(EMAIL_DISMISSED_ALERTS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (!parsed || typeof parsed !== "object") return {};
      return pruneDismissedMap(parsed);
    } catch {
      return {};
    }
  }

  const byUser = loadDismissedByUserRaw();
  if (byUser[uid]) return byUser[uid];

  // migra uma vez o legado global → usuário atual
  try {
    const legacyRaw = localStorage.getItem(EMAIL_DISMISSED_ALERTS_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Record<string, string>;
      if (legacy && typeof legacy === "object") {
        const pruned = pruneDismissedMap(legacy);
        byUser[uid] = pruned;
        persistDismissedByUser(byUser);
        localStorage.removeItem(EMAIL_DISMISSED_ALERTS_KEY);
        return pruned;
      }
    }
  } catch {
    /* ignore */
  }

  return {};
}

export function dismissAlertMessage(messageId: string, userId?: string | null) {
  const id = String(messageId || "").trim();
  if (!id) return;
  const uid = String(userId || "").trim();
  const at = new Date().toISOString();

  if (!uid) {
    const map = loadDismissedAlertIds(null);
    map[id] = at;
    localStorage.setItem(EMAIL_DISMISSED_ALERTS_KEY, JSON.stringify(map));
    return;
  }

  const byUser = loadDismissedByUserRaw();
  const map = { ...(byUser[uid] || {}) };
  map[id] = at;
  byUser[uid] = pruneDismissedMap(map);
  persistDismissedByUser(byUser);
}

type AlertPrefsSnapshot = {
  alertFilterIds: string[];
  alertFilters: EmailSavedFilter[];
  actionConfigs: EmailAlertActionConfig[];
};

/** Gerações de sync: descartar pull obsoleto se um push rolou no meio. */
let alertPrefsSyncGen = 0;

function buildAlertPrefsSnapshot(
  alertFilterIds = loadAlertEmailFilterIds()
): AlertPrefsSnapshot {
  const idSet = new Set(alertFilterIds);
  const allFilters = loadSavedEmailFilters();
  return {
    alertFilterIds,
    alertFilters: allFilters.filter((f) => idSet.has(f.id)),
    actionConfigs: loadAlertActionConfigs().filter((c) => idSet.has(c.filterId)),
  };
}

/** Empurra filtros de alerta + ações para o servidor (compartilhado com a equipe). */
export async function pushAlertPrefsToServer(snapshot?: AlertPrefsSnapshot) {
  const payload = snapshot || buildAlertPrefsSnapshot();
  alertPrefsSyncGen += 1;

  const res = await fetch("/api/emails/alert-prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Falha ao salvar preferências de alerta.");
  }
  return json.data;
}

/**
 * Puxa preferências do servidor.
 * Se o servidor ainda não foi seedado, preserva o local e sobe o que existir.
 * Evita apagar alertas do localStorage com um GET vazio (bug pós-migração).
 */
export async function pullAlertPrefsFromServer() {
  const genAtStart = alertPrefsSyncGen;
  const res = await fetch("/api/emails/alert-prefs", { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) return null;
  // Push local ocorreu durante o fetch — não sobrescrever.
  if (alertPrefsSyncGen !== genAtStart) return null;

  const initialized = Boolean(json.data?.initialized);
  const localIds = loadAlertEmailFilterIds();

  // Servidor sem linha: não sobrescreve o browser; faz bootstrap se houver algo local.
  if (!initialized) {
    if (localIds.length) {
      try {
        await pushAlertPrefsToServer(buildAlertPrefsSnapshot(localIds));
      } catch {
        /* offline */
      }
    }
    return {
      alertFilterIds: localIds,
      alertFilters: buildAlertPrefsSnapshot(localIds).alertFilters,
      actionConfigs: loadAlertActionConfigs(),
      initialized: false,
    };
  }

  const alertFilterIds = Array.isArray(json.data?.alertFilterIds)
    ? json.data.alertFilterIds.map(String)
    : [];
  const alertFilters = Array.isArray(json.data?.alertFilters)
    ? json.data.alertFilters
        .map((f: Partial<EmailSavedFilter>) => normalizeEmailFilter(f))
        .filter((f: EmailSavedFilter | null): f is EmailSavedFilter => Boolean(f))
    : [];
  const actionConfigs = Array.isArray(json.data?.actionConfigs)
    ? json.data.actionConfigs
        .map((c: Partial<EmailAlertActionConfig>) => normalizeAlertActionConfig(c))
        .filter((c: EmailAlertActionConfig | null): c is EmailAlertActionConfig =>
          Boolean(c)
        )
    : [];

  if (alertPrefsSyncGen !== genAtStart) return null;

  // Mescla filtros de alerta nas saved filters locais.
  const local = loadSavedEmailFilters();
  const byId = new Map(local.map((f) => [f.id, f]));
  for (const f of alertFilters) byId.set(f.id, f);
  persistSavedEmailFilters(Array.from(byId.values()));

  persistAlertEmailFilterIds(alertFilterIds);
  persistAlertActionConfigs(actionConfigs);

  return {
    alertFilterIds,
    alertFilters,
    actionConfigs,
    initialized: true,
  };
}
