import { prisma } from "@/lib/prisma";
import { buildExclusaoCredentialsPdf } from "@/lib/cedentes/buildExclusaoCredentialsPdf";
import {
  buildExclusaoCredentialLines,
  normalizeCpfPdfPassword,
  type Program,
  type ScopeMode,
} from "@/lib/cedentes/exclusaoDefinitivaContent";
import {
  EXCLUSION_REASON_TEXT,
  isExclusionReasonCode,
  type ExclusionReasonCode,
} from "@/lib/cedentes/exclusaoDefinitivaReasons";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionCookie = {
  id: string;
  team: string;
};

const PROGRAMS: Program[] = ["LATAM", "SMILES", "LIVELO", "ESFERA"];

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64").toString("utf8");
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") || "";
  const parts = raw.split(";").map((s) => s.trim());
  const hit = parts.find((p) => p.startsWith(name + "="));
  if (!hit) return null;
  return decodeURIComponent(hit.slice(name.length + 1));
}

function getSession(req: Request): SessionCookie | null {
  const cookie = readCookie(req, "tm.session");
  if (!cookie) return null;
  try {
    const s = JSON.parse(b64urlDecode(cookie)) as SessionCookie;
    if (!s?.id || !s?.team) return null;
    return s;
  } catch {
    return null;
  }
}

function safeFilePart(value: string) {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 80) || "cedente";
}

export async function GET(req: NextRequest) {
  try {
    const session = getSession(req);
    if (!session?.id) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cedenteId = String(searchParams.get("cedenteId") || "").trim();
    const mode = String(searchParams.get("mode") || "ACCOUNT")
      .trim()
      .toUpperCase() as ScopeMode;
    const program = String(searchParams.get("program") || "LATAM")
      .trim()
      .toUpperCase() as Program;
    const reasonCodeRaw = String(searchParams.get("reasonCode") || "DATA_DELETION_REQUEST")
      .trim()
      .toUpperCase();

    if (!cedenteId) {
      return NextResponse.json({ ok: false, error: "cedenteId obrigatório." }, { status: 400 });
    }
    if (mode !== "ACCOUNT" && mode !== "PROGRAM") {
      return NextResponse.json({ ok: false, error: "Modo inválido." }, { status: 400 });
    }
    if (mode === "PROGRAM" && !PROGRAMS.includes(program)) {
      return NextResponse.json({ ok: false, error: "Programa inválido." }, { status: 400 });
    }
    if (!isExclusionReasonCode(reasonCodeRaw)) {
      return NextResponse.json({ ok: false, error: "Motivo inválido." }, { status: 400 });
    }

    const reasonCode = reasonCodeRaw as ExclusionReasonCode;

    const cedente = await prisma.cedente.findFirst({
      where: {
        id: cedenteId,
        owner: { team: session.team },
      },
      select: {
        identificador: true,
        nomeCompleto: true,
        cpf: true,
        emailCriado: true,
        senhaEmail: true,
        senhaSmiles: true,
        senhaLatamPass: true,
        senhaLivelo: true,
        senhaEsfera: true,
        pontosLatam: true,
        pontosSmiles: true,
        pontosLivelo: true,
        pontosEsfera: true,
      },
    });

    if (!cedente) {
      return NextResponse.json({ ok: false, error: "Cedente não encontrado." }, { status: 404 });
    }

    const pdfPassword = normalizeCpfPdfPassword(cedente.cpf);
    if (!pdfPassword) {
      return NextResponse.json(
        { ok: false, error: "CPF inválido para gerar senha do PDF." },
        { status: 400 }
      );
    }

    const lines = buildExclusaoCredentialLines(cedente, {
      mode,
      program,
      reasonText: EXCLUSION_REASON_TEXT[reasonCode],
    });

    const pdfBuffer = await buildExclusaoCredentialsPdf(lines, pdfPassword);
    const fileName = `exclusao-${safeFilePart(cedente.identificador)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao gerar PDF.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
