import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
};

const MANUAL_STATUS = ["CANCELADO", "CONFIRMADO", "ALTERADO"] as const;
type ManualStatus = (typeof MANUAL_STATUS)[number];

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

function readSessionCookie(raw?: string): Sess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(raw)) as Partial<Sess>;
    if (!parsed?.id || !parsed?.login || !parsed?.team || !parsed?.role) return null;
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    return parsed as Sess;
  } catch {
    return null;
  }
}

async function getServerSession(): Promise<Sess | null> {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  return readSessionCookie(raw);
}

function parseDateMs(v?: string | null) {
  if (!v) return null;
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getTime();
}

function proximityKey(args: { departureDate?: string | null; returnDate?: string | null }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nowMs = today.getTime();

  const ds = [parseDateMs(args.departureDate), parseDateMs(args.returnDate)].filter(
    (x): x is number => x != null
  );

  if (!ds.length) return { hasUpcoming: 0, diff: Number.MAX_SAFE_INTEGER };

  const upcoming = ds.filter((x) => x >= nowMs);
  if (upcoming.length) {
    return { hasUpcoming: 1, diff: Math.min(...upcoming) - nowMs };
  }

  const nearestAbs = Math.min(...ds.map((x) => Math.abs(x - nowMs)));
  return { hasUpcoming: 0, diff: nearestAbs };
}

function buildLatamUrl(purchaseCode: string, lastName: string) {
  return `https://www.latamairlines.com/br/pt/minhas-viagens/second-detail?orderId=${encodeURIComponent(
    purchaseCode
  )}&lastname=${encodeURIComponent(lastName)}`;
}

function isLatamErrorPage(finalUrl: string, html: string) {
  const lowHtml = (html || "").toLowerCase();
  const lowUrl = (finalUrl || "").toLowerCase();
  return (
    lowUrl.includes("/minhas-viagens/error") ||
    lowHtml.includes("precisamos recarregar a informação") ||
    lowHtml.includes("temos um problema")
  );
}

async function autoCheckWithBrowserless(checkUrl: string) {
  const ws = String(process.env.BROWSERLESS_WS || "").trim();
  if (!ws) throw new Error("BROWSERLESS_WS não configurado.");

  const { chromium } = await import("playwright-core");
  const browser = await chromium.connectOverCDP(ws);
  try {
    const context = await browser.newContext({
      locale: "pt-BR",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto(checkUrl, { waitUntil: "domcontentloaded", timeout: 12000 });
    await page.waitForTimeout(1500);

    const finalUrl = page.url();
    const html = await page.content();

    if (isLatamErrorPage(finalUrl, html)) {
      return { status: "ALTERADO" as const, note: "LATAM retornou tela de erro/recarregar." };
    }

    const boardingBtnCount = await page
      .locator("button:has-text('Cartão de embarque'), a:has-text('Cartão de embarque')")
      .count();

    if (boardingBtnCount > 0) {
      return { status: "CONFIRMADO" as const, note: "Cartão de embarque disponível." };
    }

    return { status: "CANCELADO" as const, note: "Cartão de embarque não encontrado." };
  } finally {
    await browser.close();
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const rows = await prisma.sale.findMany({
    where: {
      program: "LATAM",
      purchaseCode: { startsWith: "LA", mode: "insensitive" },
      firstPassengerLastName: { not: null },
      NOT: [{ firstPassengerLastName: "" }],
    },
    select: {
      id: true,
      numero: true,
      locator: true,
      purchaseCode: true,
      firstPassengerLastName: true,
      departureDate: true,
      returnDate: true,
      latamLocatorCheckStatus: true,
      latamLocatorCheckedAt: true,
      latamLocatorCheckNote: true,
      cedente: { select: { identificador: true, nomeCompleto: true } },
      createdAt: true,
    },
    take: 5000,
  });

  const mapped = rows.map((r) => ({
    ...r,
    departureDate: r.departureDate ? r.departureDate.toISOString() : null,
    returnDate: r.returnDate ? r.returnDate.toISOString() : null,
    checkUrl: buildLatamUrl(String(r.purchaseCode || ""), String(r.firstPassengerLastName || "")),
    latamLocatorCheckedAt: r.latamLocatorCheckedAt ? r.latamLocatorCheckedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  mapped.sort((a, b) => {
    const ka = proximityKey({ departureDate: a.departureDate, returnDate: a.returnDate });
    const kb = proximityKey({ departureDate: b.departureDate, returnDate: b.returnDate });
    if (ka.hasUpcoming !== kb.hasUpcoming) return kb.hasUpcoming - ka.hasUpcoming;
    if (ka.diff !== kb.diff) return ka.diff - kb.diff;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return NextResponse.json({ ok: true, rows: mapped });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const saleId = String(body?.saleId || "").trim();
  const statusRaw = String(body?.status || "").trim().toUpperCase();
  const status = statusRaw as ManualStatus;

  if (!saleId) {
    return NextResponse.json({ ok: false, error: "saleId obrigatório." }, { status: 400 });
  }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      program: true,
      purchaseCode: true,
      firstPassengerLastName: true,
    },
  });

  if (!sale || sale.program !== "LATAM") {
    return NextResponse.json({ ok: false, error: "Venda LATAM não encontrada." }, { status: 404 });
  }

  let finalStatus: string;
  let note: string;

  if (statusRaw) {
    if (!MANUAL_STATUS.includes(status)) {
      return NextResponse.json({ ok: false, error: "Status manual inválido." }, { status: 400 });
    }
    finalStatus = status;
    note = "Atualização manual.";
  } else {
    const purchaseCode = String(sale.purchaseCode || "").trim().toUpperCase();
    const lastName = String(sale.firstPassengerLastName || "").trim();
    if (!purchaseCode || !/^LA[A-Z0-9]*$/i.test(purchaseCode) || !lastName) {
      return NextResponse.json(
        { ok: false, error: "Venda sem código LA/sobrenome válidos para checagem automática." },
        { status: 400 }
      );
    }
    const checkUrl = buildLatamUrl(purchaseCode, lastName);
    const out = await autoCheckWithBrowserless(checkUrl);
    finalStatus = out.status;
    note = out.note;
  }

  const updated = await prisma.sale.update({
    where: { id: saleId },
    data: {
      latamLocatorCheckStatus: finalStatus,
      latamLocatorCheckedAt: new Date(),
      latamLocatorCheckNote: note,
    },
    select: {
      id: true,
      latamLocatorCheckStatus: true,
      latamLocatorCheckedAt: true,
      latamLocatorCheckNote: true,
    },
  });

  return NextResponse.json({
    ok: true,
    row: {
      ...updated,
      latamLocatorCheckedAt: updated.latamLocatorCheckedAt
        ? updated.latamLocatorCheckedAt.toISOString()
        : null,
    },
  });
}
