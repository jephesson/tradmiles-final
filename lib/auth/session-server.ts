// lib/auth/session-server.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  login: string;
  name: string;
  team: string;
  role: string;
};

export type Session = {
  user: SessionUser;
};

function tryParseUserIdFromCookie(raw: string): string | null {
  if (!raw) return null;

  // 1) JSON direto
  try {
    const obj = JSON.parse(decodeURIComponent(raw));
    const id = obj?.user?.id || obj?.userId || obj?.id || obj?.sub;
    if (typeof id === "string" && id.length >= 10) return id;
  } catch {}

  // 2) Base64(JSON)
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const obj = JSON.parse(decoded);
    const id = obj?.user?.id || obj?.userId || obj?.id || obj?.sub;
    if (typeof id === "string" && id.length >= 10) return id;
  } catch {}

  // 3) JWT (payload sem validar assinatura)
  try {
    const parts = raw.split(".");
    if (parts.length >= 2) {
      const p = parts[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");

      const payloadJson = Buffer.from(p, "base64").toString("utf8");
      const obj = JSON.parse(payloadJson);
      const id = obj?.user?.id || obj?.userId || obj?.id || obj?.sub;
      if (typeof id === "string" && id.length >= 10) return id;
    }
  } catch {}

  return null;
}

export async function requireSession(req: NextRequest): Promise<Session> {
  const raw = req.cookies.get("tm.session")?.value || "";
  const userId = tryParseUserIdFromCookie(raw);

  if (!userId) throw new Error("UNAUTHORIZED");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, login: true, name: true, team: true, role: true },
  });

  if (!user) throw new Error("UNAUTHORIZED");

  return { user };
}
