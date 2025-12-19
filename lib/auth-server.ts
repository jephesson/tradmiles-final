// lib/auth-server.ts
import { cookies } from "next/headers";

type Role = "admin" | "staff";

export type Session = {
  id: string;
  login: string;
  role: Role;
  team: string;
};

function b64urlDecode(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
  return Buffer.from(padded, "base64").toString("utf8");
}

export async function getSessionServer(): Promise<Session | null> {
  try {
    const jar = await cookies(); // ✅ Next 16: cookies() pode ser Promise
    const raw = jar.get("tm.session")?.value;
    if (!raw) return null;

    const json = b64urlDecode(raw);
    const s = JSON.parse(json);

    if (!s?.id || !s?.login || !s?.role || !s?.team) return null;

    return {
      id: String(s.id),
      login: String(s.login),
      role: s.role as Role,
      team: String(s.team),
    };
  } catch {
    return null;
  }
}
