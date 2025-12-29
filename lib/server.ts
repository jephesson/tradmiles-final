import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function getSession() {
  const cookieStore = cookies();
  const sessionId = cookieStore.get("session")?.value;

  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      name: true,
      login: true,
      team: true,
      role: true,
    },
  });

  return session;
}
