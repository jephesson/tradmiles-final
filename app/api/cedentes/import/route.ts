import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PixTipo, CedenteStatus } from "@prisma/client";

/* =======================
   Tipos
======================= */
type ImportRow = {
  identificador?: string;
  nomeCompleto?: string;
  dataNascimento?: string | Date | null;
  cpf?: string;

  telefone?: string | null;
  emailCriado?: string | null;

  banco?: string | null;
  pixTipo?: keyof typeof PixTipo | PixTipo | null;
  chavePix?: string | null;

  // Senhas
  senhaEmail?: string | null;
  senhaSmiles?: string | null;
  senhaLatamPass?: string | null;
  senhaLivelo?: string | null;
  senhaEsfera?: string | null;

  // Pontos
  pontosLatam?: number | string | null;
  pontosSmiles?: number | string | null;
  pontosLivelo?: number | string | null;
  pontosEsfera?: number | string | null;

  // Responsável
  ownerId?: string;
};

/* =======================
   Utils
======================= */
function onlyDigits(v: unknown) {
  return String(v ?? "").replace(/\D+/g, "");
}

function parseIntSafe(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Math.max(0, parseInt(digits, 10)) : 0;
}

function parseDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();
  if (!s) return null;

  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function normalizePixTipo(v: unknown): PixTipo {
  const s = String(v ?? "").trim().toUpperCase();
  if (s in PixTipo) return PixTipo[s as keyof typeof PixTipo];
  return PixTipo.CPF;
}

function makeIdentifier(nome: string, index: number) {
  const cleaned = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]+/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim();

  const first = cleaned.split(/\s+/)[0] || "CED";
  const prefix = first.replace(/[^A-Z0-9]/g, "").slice(0, 3).padEnd(3, "X");
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function asEnc(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

/* =======================
   POST
======================= */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "Nenhum dado para importar" }, { status: 400 });
    }

    let count = 0;
    const errors: Array<{ i: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];

      const nomeCompleto = String(r?.nomeCompleto ?? "").trim();
      const cpf = onlyDigits(r?.cpf);

      if (!nomeCompleto) {
        errors.push({ i, reason: "nomeCompleto vazio" });
        continue;
      }
      if (cpf.length !== 11) {
        errors.push({ i, reason: "cpf inválido" });
        continue;
      }

      const ownerId = String(r?.ownerId ?? "").trim();
      if (!ownerId) {
        errors.push({ i, reason: "ownerId ausente" });
        continue;
      }

      const identificador =
        String(r?.identificador ?? "").trim() || makeIdentifier(nomeCompleto, i);

      try {
        await prisma.cedente.upsert({
          where: { cpf },

          create: {
            identificador,
            nomeCompleto,
            cpf,
            dataNascimento: parseDateSafe(r?.dataNascimento),

            telefone: r?.telefone ? String(r.telefone).trim() : null,
            emailCriado: r?.emailCriado ? String(r.emailCriado).trim() : null,

            banco: String(r?.banco ?? "").trim() || "PENDENTE",
            pixTipo: normalizePixTipo(r?.pixTipo),
            chavePix: String(r?.chavePix ?? "").trim() || "PENDENTE",

            titularConfirmado: true,

            senhaEmailEnc: asEnc(r?.senhaEmail),
            senhaSmilesEnc: asEnc(r?.senhaSmiles),
            senhaLatamPassEnc: asEnc(r?.senhaLatamPass),
            senhaLiveloEnc: asEnc(r?.senhaLivelo),
            senhaEsferaEnc: asEnc(r?.senhaEsfera),

            pontosLatam: parseIntSafe(r?.pontosLatam),
            pontosSmiles: parseIntSafe(r?.pontosSmiles),
            pontosLivelo: parseIntSafe(r?.pontosLivelo),
            pontosEsfera: parseIntSafe(r?.pontosEsfera),

            status: CedenteStatus.APPROVED,
            ownerId,
          },

          update: {
            nomeCompleto,
            dataNascimento: r?.dataNascimento ? parseDateSafe(r.dataNascimento) : undefined,

            telefone: r?.telefone ? String(r.telefone).trim() : undefined,
            emailCriado: r?.emailCriado ? String(r.emailCriado).trim() : undefined,

            banco: r?.banco ? String(r.banco).trim() : undefined,
            pixTipo: r?.pixTipo ? normalizePixTipo(r.pixTipo) : undefined,
            chavePix: r?.chavePix ? String(r.chavePix).trim() : undefined,

            senhaEmailEnc: r?.senhaEmail ? asEnc(r.senhaEmail) : undefined,
            senhaSmilesEnc: r?.senhaSmiles ? asEnc(r.senhaSmiles) : undefined,
            senhaLatamPassEnc: r?.senhaLatamPass ? asEnc(r.senhaLatamPass) : undefined,
            senhaLiveloEnc: r?.senhaLivelo ? asEnc(r.senhaLivelo) : undefined,
            senhaEsferaEnc: r?.senhaEsfera ? asEnc(r.senhaEsfera) : undefined,

            pontosLatam: r?.pontosLatam != null ? parseIntSafe(r.pontosLatam) : undefined,
            pontosSmiles: r?.pontosSmiles != null ? parseIntSafe(r.pontosSmiles) : undefined,
            pontosLivelo: r?.pontosLivelo != null ? parseIntSafe(r.pontosLivelo) : undefined,
            pontosEsfera: r?.pontosEsfera != null ? parseIntSafe(r.pontosEsfera) : undefined,

            ownerId,
          },
        });

        count++;
      } catch (e: any) {
        errors.push({ i, reason: e?.code || "erro ao salvar" });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        count,
        skipped: rows.length - count,
        errors: errors.slice(0, 50),
      },
    });
  } catch (e) {
    console.error("[IMPORT CEDENTES]", e);
    return NextResponse.json({ ok: false, error: "Erro ao importar cedentes" }, { status: 500 });
  }
}
