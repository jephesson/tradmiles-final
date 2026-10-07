import { createHmac, timingSafeEqual } from "node:crypto";
import { isSessionIdleExpired } from "@/lib/session-idle";
import { hasSessionSecret, sessionSecret } from "@/lib/session-secret";

export type Sess = {
  id: string;
  login: string;
  role: "admin" | "staff" | "socio";
  team: string;
  pages?: string[];
  last?: number;
  name?: string;
  email?: string | null;
};

const VERSION = "s1";

export function signSessionValue(payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${VERSION}.${body}.${sig}`;
}

export function verifySessionValue<T>(raw?: string | null): T | null {
  if (!raw || !hasSessionSecret()) return null;
  const parts = String(raw).split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const body = parts[1] || "";
  const sig = parts[2] || "";
  const expected = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function readSessionCookie(raw?: string | null): Sess | null {
  if (!raw) return null;
  try {
    const data = verifySessionValue<Sess>(raw);
    if (!data?.id || !data?.login || !data?.team || !data?.role) return null;
    if (isSessionIdleExpired(data.last)) return null;
    return data;
  } catch {
    return null;
  }
}
