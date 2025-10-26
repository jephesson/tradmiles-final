// src/app/api/cedentes/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const BLOB_KIND = "cedentes_blob";

/* =========================
 * Tipos e helpers locais
 * ========================= */
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type Cedente = {
  identificador: string;
  nome_completo: string;
  latam: number;
  esfera: number;
  livelo: number;
  smiles: number;
  responsavelId: string | null;
  responsavelNome: string | null;
};

type CedentesPayload = {
  savedAt: string;                // ISO
  listaCedentes?: Cedente[];      // usado pela UI
  meta?: Record<string, Json>;    // opcional (auditoria)
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const noCacheHeaders = (extra?: Record<string, string>): HeadersInit => ({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
  ...(extra ?? {}),
});

const ok = (data: unknown, init?: ResponseInit) =>
  NextResponse.json({ ok: true, data }, init);

const fail = (message: string, status = 500) =>
  NextResponse.json({ ok: false, error: message }, { status, headers: noCacheHeaders() });

/** --------- Sanitização flexível (sem any) ---------
 * Aceita formatos:
 * - { responsavelId, responsavelNome }
 * - { responsavel: { id, nome } }
 * - { responsavel: "Nome do responsável" } (sem id)
 * Não converte `undefined` para `null` antes do merge.
 */
function coerceCedenteLoose(
  x: unknown
): Omit<Cedente, "responsavelId" | "responsavelNome"> & {
  responsavelId?: string | null | undefined;
  responsavelNome?: string | null | undefined;
} {
  const r: Record<string, unknown> = isRecord(x) ? x : {};

  const identificador = String((r.identificador ?? "") as string).toUpperCase();
  const nome_completo = String((r.nome_completo ?? r.nome ?? "") as string);

  const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const latam = toNum(r.latam);
  const esfera = toNum(r.esfera);
  const livelo = toNum(r.livelo);
  const smiles = toNum(r.smiles);

  // Helpers p/ string | null | undefined
  const optStrOrNull = (v: unknown): string | null | undefined =>
    v === undefined ? undefined : v === null ? null : String(v);

  // 1) Campos diretos
  const directRespId = Object.prototype.hasOwnProperty.call(r, "responsavelId")
    ? (r as Record<string, unknown>)["responsavelId"]
    : undefined;
  const directRespNome = Object.prototype.hasOwnProperty.call(r, "responsavelNome")
    ? (r as Record<string, unknown>)["responsavelNome"]
    : undefined;

  let responsavelId = optStrOrNull(directRespId);
  let responsavelNome = optStrOrNull(directRespNome);

  // 2) Objeto aninhado: responsavel: { id, nome }
  const respRaw = (r as Record<string, unknown>)["responsavel"];
  if (isRecord(respRaw)) {
    if (Object.prototype.hasOwnProperty.call(respRaw, "id")) {
      responsavelId = optStrOrNull(
        (respRaw as Record<string, unknown>)["id"]
      );
    }
    if (Object.prototype.hasOwnProperty.call(respRaw, "nome")) {
      responsavelNome = optStrOrNull(
        (respRaw as Record<string, unknown>)["nome"]
      );
    }
  } else if (typeof respRaw === "string" && responsavelNome === undefined) {
    // 3) responsavel: "Nome"
    responsavelNome = respRaw;
  }

  return {
    identificador,
    nome_completo,
    latam,
    esfera,
    livelo,
    smiles,
    responsavelId,
    responsavelNome,
  };
}

/** Normaliza para Cedente final, preenchendo faltas com null */
function finalizeCedente(
  loose: ReturnType<typeof coerceCedenteLoose>,
  previous?: Cedente | null
): Cedente {
  const prev = previous ?? null;
  return {
    identificador: loose.identificador || prev?.identificador || "",
    nome_completo: loose.nome_completo || prev?.nome_completo || "",
    latam: Number.isFinite(loose.latam) ? loose.latam : prev?.latam || 0,
    esfera: Number.isFinite(loose.esfera) ? loose.esfera : prev?.esfera || 0,
    livelo: Number.isFinite(loose.livelo) ? loose.livelo : prev?.livelo || 0,
    smiles: Number.isFinite(loose.smiles) ? loose.smiles : prev?.smiles || 0,
    // Preserva responsável salvo se não vier na requisição
    responsavelId:
      loose.responsavelId !== undefined ? (loose.responsavelId ?? null) : prev?.responsavelId ?? null,
    responsavelNome:
      loose.responsavelNome !== undefined ? (loose.responsavelNome ?? null) : prev?.responsavelNome ?? null,
  };
}

/* =========================
 * GET: retorna payload salvo
 * ========================= */
export async function GET() {
  try {
    const blob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });

    const raw = (blob?.data as CedentesPayload | null) ?? null;
    const data: CedentesPayload | null = raw
      ? { ...raw, listaCedentes: Array.isArray(raw.listaCedentes) ? raw.listaCedentes : [] }
      : null;

    const lastMod =
      blob && "updatedAt" in blob && blob.updatedAt instanceof Date
        ? blob.updatedAt.toUTCString()
        : undefined;

    return ok(data, {
      status: 200,
      headers: noCacheHeaders({
        "X-Data-Kind": BLOB_KIND,
        ...(lastMod ? { "Last-Modified": lastMod } : {}),
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao carregar do banco";
    return fail(msg, 500);
  }
}

/* =========================
 * POST: salva/atualiza blob
 * ========================= */
export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json().catch(() => ({}));
    const body = isRecord(raw) ? raw : {};

    // Entrada pode ser { listaCedentes, meta } ou payload legado
    const incoming = Array.isArray(body.listaCedentes) ? (body.listaCedentes as unknown[]) : [];

    // Carrega existente para preservar campos não enviados
    const existingBlob = await prisma.appBlob.findUnique({ where: { kind: BLOB_KIND } });
    const existingList: Cedente[] = Array.isArray(
      (existingBlob?.data as CedentesPayload | undefined)?.listaCedentes
    )
      ? ((existingBlob!.data as CedentesPayload).listaCedentes as Cedente[])
      : [];

    const existingById = new Map(existingList.map((c) => [c.identificador, c]));

    const listaCedentes: Cedente[] = incoming.map((row) => {
      const loose = coerceCedenteLoose(row);
      const prev = existingById.get(loose.identificador) ?? null;
      return finalizeCedente(loose, prev);
    });

    const meta = isRecord(body.meta) ? (body.meta as Record<string, Json>) : undefined;

    const payload: CedentesPayload = {
      savedAt: new Date().toISOString(),
      listaCedentes,
      ...(meta ? { meta } : {}),
    };

    await prisma.appBlob.upsert({
      where: { kind: BLOB_KIND },
      create: { id: crypto.randomUUID(), kind: BLOB_KIND, data: payload },
      update: { data: payload },
    });

    return ok(payload, {
      status: 200,
      headers: noCacheHeaders({ "X-Data-Kind": BLOB_KIND }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao salvar no banco";
    return fail(msg, 500);
  }
}

/* =========================
 * DELETE: limpa/reset
 * ========================= */
export async function DELETE() {
  try {
    const payload: CedentesPayload = {
      savedAt: new Date().toISOString(),
      listaCedentes: [],
      meta: { source: "api:delete" },
    };

    await prisma.appBlob.upsert({
      where: { kind: BLOB_KIND },
      create: { id: crypto.randomUUID(), kind: BLOB_KIND, data: payload },
      update: { data: payload },
    });

    return ok(payload, {
      status: 200,
      headers: noCacheHeaders({ "X-Data-Kind": BLOB_KIND }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro ao limpar";
    return fail(msg, 500);
  }
}
