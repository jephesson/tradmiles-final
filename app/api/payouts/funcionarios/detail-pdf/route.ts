import { NextResponse } from "next/server";
import { GET as monthSummaryGET } from "@/app/api/payouts/funcionarios/month-summary/route";
import { buildEmployeeDetailPdf, type DetailPdfRow } from "@/lib/payouts/employeeDetailPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * PDF com a conta completa de um funcionário no mês.
 * Usa a mesma resposta da tela (month-summary), então os números são idênticos
 * e a regra de visão (funcionário só vê a si mesmo) vale igual.
 */

function slug(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const month = String(url.searchParams.get("month") || "").trim();
  const userId = String(url.searchParams.get("userId") || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ ok: false, error: "Mês inválido." }, { status: 400 });

  // Mesma conta da tela.
  const qs = new URLSearchParams({ month });
  if (userId) qs.set("asUserId", userId);
  const res = await monthSummaryGET(new Request(`${url.origin}/api/payouts/funcionarios/month-summary?${qs}`, { headers: req.headers }));
  const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; rows?: DetailPdfRow[] } | null;
  if (!res.ok || !json?.ok) {
    return NextResponse.json({ ok: false, error: json?.error || "Não deu para carregar o mês." }, { status: res.status || 400 });
  }
  const row = (json.rows || []).find((r) => !userId || r.user.id === userId) || null;
  if (!row) return NextResponse.json({ ok: false, error: "Funcionário sem dados neste mês." }, { status: 404 });

  const bytes = await buildEmployeeDetailPdf(row, month);
  const who = slug(String(row.user.name || row.user.login).split(/\s+/)[0] || "funcionario");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="detalhamento-${who}-${month}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
