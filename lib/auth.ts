// src/lib/auth.ts
"use client";

export type Session = {
  id: string;
  name: string;
  login: string;
  email?: string | null;
  team: string;
  role: "admin" | "staff";
};

const AUTH_SESSION_KEY = "auth_session";

/* =========================
 * Cache local (UI only)
 * ========================= */
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.id || !s?.login || !s?.team) return null;
    return s as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session | null) {
  if (!session) {
    localStorage.removeItem(AUTH_SESSION_KEY);
    return;
  }
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export async function signOut(): Promise<boolean> {
  try {
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setSession(null);
    return r.ok;
  } catch {
    setSession(null);
    return false;
  }
}

/* =========================
 * Ações no servidor (/api/auth)
 * ========================= */

// opcional: força o handler existir (mantém compat)
export async function ensureSeedCredentials(): Promise<void> {
  try {
    await fetch("/api/auth", { method: "GET" });
  } catch {}
}

/** Restaura credenciais do seed (jephesson/ufpb2010; demais/1234) */
export async function resetCredentialsToSeed(): Promise<boolean> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resetSeed" }),
  });
  return res.ok;
}

/** Atualiza senha de um login existente no banco */
export async function setPassword(login: string, newPassword: string): Promise<boolean> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setPassword", login, password: newPassword }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) throw new Error(json?.error || "Falha ao salvar senha");
  return true;
}

function normalizeRole(v: unknown): "admin" | "staff" {
  return String(v ?? "").toLowerCase() === "admin" ? "admin" : "staff";
}

/** Login no servidor (grava cookie) e guarda sessão no localStorage (UI) */
export async function signIn(params: {
  login: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "login",
      login: params.login,
      password: params.password,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    const err =
      typeof json?.error === "string" && json.error.trim()
        ? json.error
        : "Login ou senha inválidos";
    return { ok: false, error: err };
  }

  const raw = json?.data?.session;
  if (raw?.id && raw?.login && raw?.team) {
    setSession({
      id: String(raw.id),
      name: String(raw.name || raw.login),
      login: String(raw.login),
      email: raw.email ?? null,
      team: String(raw.team),
      role: normalizeRole(raw.role),
    });
  }
  return { ok: true };
}
