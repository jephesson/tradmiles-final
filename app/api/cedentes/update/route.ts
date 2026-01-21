import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const ALLOWED_KEYS = new Set([
  "identificador",
  "nomeCompleto",
  "cpf",
  "dataNascimento",
  "telefone",
  "emailCriado",

  "banco",
  "pixTipo",
  "chavePix",
  "titularConfirmado",

  "senhaEmail",
  "senhaSmiles",
  "senhaLatamPass",
  "senhaLivelo",
  "senhaEsfera",

  "pontosLatam",
  "pontosSmiles",
  "pontosLivelo",
  "pontosEsfera",

  "status",
  "reviewedAt",
  "reviewedById",
  "inviteId",
] as const);

function pickAllowed(data: any) {
  const out: any = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (!ALLOWED_KEYS.has(k)) continue;

    // normaliza senhas vazias para null (opcional, mas ajuda)
    if (k.startsWith("senha") && (v === "" || (typeof v === "string" && v.trim() === ""))) {
      out[k] = null;
      continue;
    }

    out[k] = v;
  }
  return out;
}

export async function PUT(req: Request) {
  try {
    const { id, data } = await req.json();

    if (!id || !data) {
      return NextResponse.json(
        { ok: false, error: "ID ou data ausente." },
        { status: 400 }
      );
    }

    const safeData = pickAllowed(data);

    const updated = await prisma.cedente.update({
      where: { id },
      data: safeData,
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error("PUT /api/cedentes error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Erro ao salvar." },
      { status: 500 }
    );
  }
}
