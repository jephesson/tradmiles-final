import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth-server";
import ClubesClient from "./ClubesClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toISO(d: Date | null) {
  return d ? d.toISOString() : null;
}

export default async function Page() {
  const session = await getSessionFromCookies();
  if (!session?.user) redirect("/login?next=/dashboard/clubes");

  const team = session.user.team;

  const cedentes = await prisma.cedente.findMany({
    where: { owner: { team } },
    select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
    orderBy: [{ nomeCompleto: "asc" }],
  });

  const clubesRaw = await prisma.clubSubscription.findMany({
    where: { team },
    include: {
      cedente: { select: { id: true, identificador: true, nomeCompleto: true, cpf: true } },
    },
    orderBy: [{ subscribedAt: "desc" }, { createdAt: "desc" }],
  });

  const clubes = clubesRaw.map((c) => ({
    ...c,
    subscribedAt: toISO(c.subscribedAt),
    lastRenewedAt: toISO(c.lastRenewedAt),
    pointsExpireAt: toISO(c.pointsExpireAt),
    smilesBonusEligibleAt: toISO(c.smilesBonusEligibleAt),
    createdAt: toISO(c.createdAt),
    updatedAt: toISO(c.updatedAt),
  }));

  return <ClubesClient initialCedentes={cedentes} initialClubes={clubes} />;
}
