// lib/session.ts
import { isSessionIdleExpired } from "@/lib/session-idle";

export type Sess = {
  id: string;
  login: string;
  role: "admin" | "staff" | "socio";
  team: string;
  pages?: string[];
  last?: number;
};

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

export function readSessionCookie(raw?: string | null): Sess | null {
  if (!raw) return null;
  try {
    const json = b64urlDecode(raw);
    const data = JSON.parse(json) as Sess;
    if (!data?.id || !data?.login || !data?.team || !data?.role) return null;
    if (isSessionIdleExpired(data.last)) return null;
    return data;
  } catch {
    return null;
  }
}
