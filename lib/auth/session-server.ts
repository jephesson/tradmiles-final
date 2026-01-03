// lib/auth/session-server.ts
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  login: string;
  name: string;
  team: string;
  role: string;
  employeeId?: string | null;
};

export type Session = { user: SessionUser };

function readCookieFromHeader(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(name + "=")) {
      return decodeURIComponent(p.slice(name.length + 1));
    }
  }
  return null;
}

export async function requireSession(req?: Request): Promise<Session> {
  // ✅ se veio Request (ex.: route handler), lê do header
  // ✅ se não veio, usa cookies() do Next (server)
  const token =
    req ? readCookieFromHeader(req.headers.get("cookie"), "tm.session") : cookies().get("tm.session")?.value;

  if (!token) throw new Error("UNAUTHENTICATED");

  // 🔸 No seu sistema, o tm.session normalmente é o userId (uuid)
  const user = await prisma.user.findUnique({
    where: { id: token },
    select: { id: true, login: true, name: true, team: true, role: true, employeeId: true },
  });

  if (!user) throw new Error("UNAUTHENTICATED");

  return { user };
}
