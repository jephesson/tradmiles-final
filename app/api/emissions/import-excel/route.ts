import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { LoyaltyProgram } from "@prisma/client";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** =========================
 *  NORMALIZAÇÕES / MATCH
 *  ========================= */

function normName(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Similaridade por Dice (bigrams). Simples e bom pro “90%”
function diceSimilarity(a: string, b: string) {
  const A = normName(a);
  const B = normName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;

  const bigrams = (s: string) => {
    const out: string[] = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };

  const a2 = bigrams(A);
  const b2 = bigrams(B);
  if (a2.length === 0 || b2.length === 0) return 0;

  const map = new Map<string, number>();
  for (const x of a2) map.set(x, (map.get(x) || 0) + 1);

  let inter = 0;
  for (const x of b2) {
    const c = map.get(x) || 0;
    if (c > 0) {
      inter++;
      map.set(x, c - 1);
    }
  }
  return (2 * inter) / (a2.length + b2.length);
}

/** =========================
 *  PARSE DE MÊS (linha 2)
 *  Aceita: "dez/24", "jan/25", "jan/25 (at)", "jan/2025", etc.
 *  ========================= */

const monthMap: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};

function parseMonthHeaderToLastDayUTC(headerRaw: any): Date | null {
  const s = String(headerRaw ?? "").trim().toLowerCase();
  if (!s) return null;

  // remove coisas tipo "(at)" e espaços extras
  const cleaned = s.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();

  // tenta "dez/24" ou "dez/2024"
  const m = cleaned.match(/^([a-zç]{3})\/(\d{2}|\d{4})$/i);
  if (!m) return null;

  const monStr = m[1].slice(0, 3);
  const mon = monthMap[monStr];
  if (mon === undefined) return null;

  let year = Number(m[2]);
  if (!Number.isFinite(year)) return null;
  if (year < 100) year = 2000 + year;

  // último dia do mês em UTC: dia 0 do mês seguinte
  const lastDay = new Date(Date.UTC(year, mon + 1, 0, 23, 59, 59, 999));
  return lastDay;
}

/** =========================
 *  UTIL
 *  ========================= */

function parseProgram(v: any): LoyaltyProgram | null {
  const s = String(v || "").trim().toUpperCase();
  if (s === "LATAM") return LoyaltyProgram.LATAM;
  if (s === "SMILES") return LoyaltyProgram.SMILES;
  if (s === "LIVELO") return LoyaltyProgram.LIVELO;
  if (s === "ESFERA") return LoyaltyProgram.ESFERA;
  return null;
}

function toIntOrZero(v: any) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0;
  const s = String(v ?? "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

type MonthCol = { colIdx: number; dateLastDayUTC: Date; label: string };

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  // FormData: file, sheetName(opcional), programa, threshold(opcional), dryRun(opcional)
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const sheetName = String(form.get("sheetName") || "").trim(); // ex: "Contagem CPF"
  const programa = parseProgram(form.get("programa"));
  const threshold = Math.max(0, Math.min(1, Number(form.get("threshold") ?? 0.9)));
  const dryRun = String(form.get("dryRun") || "false").toLowerCase() === "true";

  if (!file) return NextResponse.json({ ok: false, error: "Arquivo .xlsx é obrigatório (field: file)." }, { status: 400 });
  if (!programa) return NextResponse.json({ ok: false, error: "programa inválido." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });

  const targetSheetName = sheetName || wb.SheetNames[0];
  const ws = wb.Sheets[targetSheetName];
  if (!ws) {
    return NextResponse.json(
      { ok: false, error: `Aba não encontrada: ${targetSheetName}. Abas disponíveis: ${wb.SheetNames.join(", ")}` },
      { status: 400 }
    );
  }

  // Lê a planilha como matriz (rows/cols)
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

  // Esperado:
  // Linha 2 (index 1) tem meses em D..Q
  // Linha 3+ (index 2+) tem Nome em A (col 0) e números em D..Q
  const headerRow = rows[1];
  if (!headerRow || headerRow.length < 4) {
    return NextResponse.json({ ok: false, error: "Linha 2 (cabeçalho de meses) não encontrada ou inválida." }, { status: 400 });
  }

  // Monta colunas de meses: D..Q => colIdx 3..16 (ajuste se você mudar)
  const monthCols: MonthCol[] = [];
  for (let colIdx = 3; colIdx <= 16; colIdx++) {
    const label = String(headerRow[colIdx] ?? "").trim();
    const d = parseMonthHeaderToLastDayUTC(label);
    if (d) monthCols.push({ colIdx, dateLastDayUTC: d, label });
  }
  if (monthCols.length === 0) {
    return NextResponse.json({ ok: false, error: "Não consegui interpretar nenhum mês na linha 2 (D..Q)." }, { status: 400 });
  }

  // Carrega cedentes aprovados desse programa (ou todos — aqui vou pegar todos)
  const cedentes = await prisma.cedente.findMany({
    select: { id: true, identificador: true, nomeCompleto: true, cpf: true },
  });

  // Index por nome normalizado (ajuda um pouco)
  const cedentesNorm = cedentes.map((c) => ({
    ...c,
    nomeNorm: normName(c.nomeCompleto),
  }));

  const unmatched: Array<{ excelName: string; bestScore: number; best?: { id: string; nomeCompleto: string; identificador: string } }> = [];
  const plannedEvents: Array<{
    cedenteId: string;
    issuedAt: Date;
    passengersCount: number;
    note: string | null;
  }> = [];

  // Percorre linhas a partir da 3
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const excelName = String(row[0] ?? "").trim();
    if (!excelName) continue;

    // acha o melhor match
    let bestScore = 0;
    let best: (typeof cedentesNorm)[number] | null = null;

    for (const c of cedentesNorm) {
      // um “atalho”: se contém o primeiro nome + último nome, aumenta chance
      const s = diceSimilarity(excelName, c.nomeCompleto);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }

    if (!best || bestScore < threshold) {
      unmatched.push({
        excelName,
        bestScore,
        best: best
          ? { id: best.id, nomeCompleto: best.nomeCompleto, identificador: best.identificador }
          : undefined,
      });
      continue;
    }

    // para cada mês, cria evento se houver valor
    for (const mc of monthCols) {
      const qty = toIntOrZero(row[mc.colIdx]);
      if (qty <= 0) continue;

      plannedEvents.push({
        cedenteId: best.id,
        issuedAt: mc.dateLastDayUTC,
        passengersCount: qty,
        note: `Import Excel (${targetSheetName}) — ${mc.label} — nomeExcel="${excelName}" — score=${bestScore.toFixed(3)}`,
      });
    }
  }

  // Se for dryRun, não grava
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      sheet: targetSheetName,
      program: programa,
      threshold,
      monthsDetected: monthCols.map((m) => ({ colIdx: m.colIdx, label: m.label, issuedAt: m.dateLastDayUTC.toISOString() })),
      plannedCount: plannedEvents.length,
      unmatchedCount: unmatched.length,
      unmatched: unmatched.slice(0, 50),
      samplePlanned: plannedEvents.slice(0, 50).map((e) => ({
        ...e,
        issuedAt: e.issuedAt.toISOString(),
      })),
    });
  }

  // Grava tudo em transação
  // Observação: aqui estou usando source "MANUAL" porque seu enum atual tem MANUAL.
  // Se você criar EmissionSource.IMPORT, troque aqui.
  const created = await prisma.$transaction(async (tx) => {
    // Se quiser evitar duplicar importações: você pode deletar “mesmo cedente/programa/issuedAt” antes, ou fazer upsert.
    // Aqui vou apenas inserir (simples).
    const res = await Promise.all(
      plannedEvents.map((e) =>
        tx.emissionEvent.create({
          data: {
            cedenteId: e.cedenteId,
            program: programa,
            passengersCount: e.passengersCount,
            issuedAt: e.issuedAt,
            source: "MANUAL" as any,
            note: e.note,
          },
          select: { id: true },
        })
      )
    );
    return res.length;
  });

  return NextResponse.json({
    ok: true,
    sheet: targetSheetName,
    program: programa,
    threshold,
    inserted: created,
    unmatchedCount: unmatched.length,
    unmatched: unmatched.slice(0, 50),
  });
}
