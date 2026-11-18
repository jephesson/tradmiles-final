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

    const [cedentes, referrals, exclusions] = await Promise.all([
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
      // Excluídos (conta inteira) continuam na rede, marcados, para saber se algum indicado deu problema.
      prisma.cedenteExclusion.findMany({
        where: { team: session.team, scope: "ACCOUNT", restoredAt: null },
        select: {
          cedenteId: true,
          cedenteIdentificador: true,
          cedenteNomeCompleto: true,
          details: true,
          createdAt: true,
          deletedBy: { select: { name: true, login: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8000,
      }),
    ]);

    type Ced = (typeof cedentes)[number];
    const excludedInfo = new Map<string, { at: string; by: string; reason: string | null }>();
    const ghosts: Ced[] = [];
    const known = new Set(cedentes.map((c) => c.id));
    for (const ex of exclusions) {
      if (excludedInfo.has(ex.cedenteId)) continue;
      const d = (ex.details && typeof ex.details === "object" ? ex.details : {}) as Record<string, unknown>;
      excludedInfo.set(ex.cedenteId, {
        at: ex.createdAt.toISOString(),
        by: ex.deletedBy?.name || ex.deletedBy?.login || "—",
        reason: typeof d.reasonText === "string" ? d.reasonText : null,
      });
      // Cadastro apagado de vez: recria o nó a partir do rastro (com quem indicou).
      if (!known.has(ex.cedenteId) && d.mode === "CADASTRO_APAGADO") {
        known.add(ex.cedenteId);
        ghosts.push({
          id: ex.cedenteId,
          identificador: ex.cedenteIdentificador,
          nomeCompleto: ex.cedenteNomeCompleto,
          status: "REJECTED",
          referredByCedenteId: typeof d.referrerCedenteId === "string" ? d.referrerCedenteId : null,
          owner: { id: "", name: typeof d.ownerName === "string" ? d.ownerName : "—", login: "" },
        } as Ced);
      }
    }
    cedentes.push(...ghosts);

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
        status: excludedInfo.has(c.id) ? "EXCLUIDO" : c.status,
        excluded: excludedInfo.get(c.id) || null,
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
          excluded: nodes.filter((n) => n.status === "EXCLUIDO").length,
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
