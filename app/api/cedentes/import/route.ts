import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PixTipo, CedenteStatus } from "@prisma/client";

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

  // Senhas (vamos salvar nos campos *Enc* do teu schema)
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

  // Responsável (OBRIGATÓRIO no schema)
  ownerId?: string;
};

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

  // aceita "YYYY-MM-DD" ou ISO
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  // tenta "DD/MM/AAAA"
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
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
  const prefix = (first.replace(/[^A-Z0-9]/g, "").slice(0, 3) || "CED").padEnd(3, "X");
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

/**
 * IMPORTANTE:
 * Seus campos são "*Enc". Aqui eu vou salvar o valor "como veio"
 * (sem criptografar) só pra buildar e funcionar.
 * Depois a gente troca por encrypt de verdade.
 */
function asEnc(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

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

      // obrigatórios (se faltar, pula)
      if (!nomeCompleto) {
        errors.push({ i, reason: "nomeCompleto vazio" });
        continue;
      }
      if (cpf.length !== 11) {
        errors.push({ i, reason: "cpf inválido" });
        continue;
      }

      // ownerId é obrigatório no teu schema
      const ownerId = String(r?.ownerId ?? "").trim();
      if (!ownerId) {
        errors.push({ i, reason: "ownerId ausente (responsável obrigatório)" });
        continue;
      }

      // identificador obrigatório e unique
      const identificador = String(r?.identificador ?? "").trim() || makeIdentifier(nomeCompleto, i);

      const banco = String(r?.banco ?? "").trim() || "PENDENTE";
      const pixTipo = normalizePixTipo(r?.pixTipo);
      const chavePix = String(r?.chavePix ?? "").trim() || "PENDENTE";

      const dataNascimento = parseDateSafe(r?.dataNascimento);

      try {
        await prisma.cedente.create({
          data: {
            identificador,

            nomeCompleto,
            cpf,
            dataNascimento,

            telefone: r?.telefone ? String(r.telefone).trim() : null,
            emailCriado: r?.emailCriado ? String(r.emailCriado).trim() : null,

            banco,
            pixTipo,
            chavePix,
            titularConfirmado: true,

            // campos *Enc*
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
        });

        count++;
      } catch (e: any) {
        // erro comum: unique cpf/identificador
        errors.push({ i, reason: e?.code ? `${e.code}` : "falha ao criar (provável duplicata)" });
      }
    }

    return NextResponse.json({
      ok: true,
      data: { count, skipped: rows.length - count, errors: errors.slice(0, 50) },
    });
  } catch (e) {
    console.error("[IMPORT CEDENTES]", e);
    return NextResponse.json({ ok: false, error: "Erro ao importar cedentes" }, { status: 500 });
  }
}
