import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: NextRequest) {
  // ✅ se sua API já é protegida por middleware/cookie, isso pode ficar assim mesmo.
  const hasSessionCookie = req.cookies.get("tm.session")?.value;
  if (!hasSessionCookie) return jsonError(401, "Não autenticado.");

  const url = new URL(req.url);
  const cedenteId = (url.searchParams.get("cedenteId") || "").trim();
  const program = (url.searchParams.get("program") || "LATAM").toUpperCase() as Program;

  if (!cedenteId) return jsonError(400, "cedenteId é obrigatório.");

  const ced = await prisma.cedente.findUnique({
    where: { id: cedenteId },
    select: {
      id: true,
      status: true,
      cpf: true,

      // ⚠️ AJUSTE NOMES CONFORME SEU SCHEMA
      senhaLatamPass: true,
      emailLatam: true,
      senhaEmailLatam: true,

      senhaSmiles: true,
      emailSmiles: true,
      senhaEmailSmiles: true,

      senhaLivelo: true,
      emailLivelo: true,
      senhaEmailLivelo: true,

      senhaEsfera: true,
      emailEsfera: true,
      senhaEmailEsfera: true,
    } as any,
  });

  if (!ced) return jsonError(404, "Cedente não encontrado.");
  if ((ced as any).status !== "APPROVED") return jsonError(403, "Cedente não aprovado.");

  let programPassword = "";
  let programEmail = "";
  let emailPassword = "";

  if (program === "LATAM") {
    programPassword = (ced as any).senhaLatamPass || "";
    programEmail = (ced as any).emailLatam || "";
    emailPassword = (ced as any).senhaEmailLatam || "";
  } else if (program === "SMILES") {
    programPassword = (ced as any).senhaSmiles || "";
    programEmail = (ced as any).emailSmiles || "";
    emailPassword = (ced as any).senhaEmailSmiles || "";
  } else if (program === "LIVELO") {
    programPassword = (ced as any).senhaLivelo || "";
    programEmail = (ced as any).emailLivelo || "";
    emailPassword = (ced as any).senhaEmailLivelo || "";
  } else if (program === "ESFERA") {
    programPassword = (ced as any).senhaEsfera || "";
    programEmail = (ced as any).emailEsfera || "";
    emailPassword = (ced as any).senhaEmailEsfera || "";
  }

  return NextResponse.json({
    ok: true,
    data: {
      cpf: (ced as any).cpf || "",
      program,
      programPassword,
      programEmail,
      emailPassword,
    },
  });
}
