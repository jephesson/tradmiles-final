/**
 * "Ver como emissor": o admin enxerga a interface do emissor no próprio login.
 * É só visualização — as APIs continuam rodando como admin (venda salva fica no nome do admin).
 * Cookie legível no cliente: "<emissorId>|<nome>".
 */
export const VIEW_AS_EMISSOR_COOKIE = "tm.verComoEmissor";

export type ViewAsEmissor = { id: string; name: string };

export function parseViewAsEmissor(raw: string | null | undefined): ViewAsEmissor | null {
  if (!raw) return null;
  let v = raw;
  try {
    v = decodeURIComponent(raw);
  } catch {
    /* usa como veio */
  }
  const [id, ...rest] = v.split("|");
  if (!id || !/^[\w-]{6,64}$/.test(id)) return null;
  return { id, name: rest.join("|") || "Emissor" };
}

/** Só vale para admin. */
export function viewAsForRole(role: unknown, raw: string | null | undefined) {
  return String(role || "") === "admin" ? parseViewAsEmissor(raw) : null;
}

/* ===== cliente ===== */

export function readViewAsEmissorClient(): ViewAsEmissor | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${VIEW_AS_EMISSOR_COOKIE}=`));
  return parseViewAsEmissor(hit ? hit.slice(VIEW_AS_EMISSOR_COOKIE.length + 1) : null);
}

export function startViewAsEmissor(e: ViewAsEmissor) {
  const value = encodeURIComponent(`${e.id}|${e.name}`);
  document.cookie = `${VIEW_AS_EMISSOR_COOKIE}=${value}; path=/; max-age=${8 * 60 * 60}; samesite=lax`;
}

export function stopViewAsEmissor() {
  document.cookie = `${VIEW_AS_EMISSOR_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
