import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionServer } from "@/lib/auth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSessionServer();
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const [cedentes, referrals] = await Promise.all([
      prisma.cedente.findMany({
        where: { owner: { team: session.team } },
        select: {
          id: true,
          identificador: true,
          nomeCompleto: true,
          status: true,
          referredByCedenteId: true,
          owner: { select: { id: true, name: true, login: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 8000,
      }),
      prisma.cedenteReferral.findMany({
        where: { referrerCedente: { owner: { team: session.team } } },
        select: {
          referrerCedenteId: true,
          referredCedenteId: true,
          status: true,
        },
        take: 8000,
      }),
    ]);

    const byId = new Map(cedentes.map((c) => [c.id, c]));
    const parentById = new Map<string, string>();

    for (const c of cedentes) {
      const parentId = c.referredByCedenteId;
      if (parentId && parentId !== c.id && byId.has(parentId)) {
        parentById.set(c.id, parentId);
      }
    }

    for (const r of referrals) {
      if (!byId.has(r.referrerCedenteId) || !byId.has(r.referredCedenteId)) continue;
      if (r.referrerCedenteId === r.referredCedenteId) continue;
      if (!parentById.has(r.referredCedenteId)) {
        parentById.set(r.referredCedenteId, r.referrerCedenteId);
      }
    }

    const visiting = new Set<string>();
    const visitingSafe = (id: string, seen: Set<string>): boolean => {
      if (seen.has(id) || visiting.has(id)) return false;
      visiting.add(id);
      seen.add(id);
      const parent = parentById.get(id);
      if (!parent) {
        visiting.delete(id);
        return true;
      }
      const ok = visitingSafe(parent, seen);
      visiting.delete(id);
      if (!ok) parentById.delete(id);
      return ok;
    };
    for (const id of parentById.keys()) visitingSafe(id, new Set());

    const linked = new Set<string>();
    for (const [child, parent] of parentById) {
      linked.add(child);
      linked.add(parent);
    }

    const nodes = [...linked]
      .map((id) => byId.get(id))
      .filter((c): c is (typeof cedentes)[number] => Boolean(c))
      .map((c) => ({
        id: c.id,
        identificador: c.identificador,
        nomeCompleto: c.nomeCompleto,
        status: c.status,
        ownerName: c.owner?.name || c.owner?.login || "—",
        parentId: parentById.get(c.id) || null,
      }));

    const edges = [...parentById.entries()].map(([to, from]) => ({ from, to }));

    const childCount = new Map<string, number>();
    for (const e of edges) childCount.set(e.from, (childCount.get(e.from) || 0) + 1);

    const roots = nodes.filter((n) => !n.parentId).length;

    return NextResponse.json({
      ok: true,
      data: {
        nodes,
        edges,
        stats: {
          people: nodes.length,
          links: edges.length,
          roots,
          maxDirect: Math.max(0, ...childCount.values()),
        },
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error && e.message ? e.message : "Erro ao carregar a rede." },
      { status: 400 }
    );
  }
}
