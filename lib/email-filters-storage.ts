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

export const EMAIL_SAVED_FILTERS_KEY = "tm.emailSavedFilters";
export const EMAIL_PINNED_FILTER_IDS_KEY = "tm.emailPinnedFilterIds";
export const EMAIL_ALERT_FILTER_IDS_KEY = "tm.emailAlertFilterIds";
export const EMAIL_DISMISSED_ALERTS_KEY = "tm.emailDismissedAlertIds";

const PROGRAMS = ["ALL", "SMILES", "LATAM", "LIVELO"] as const;

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
