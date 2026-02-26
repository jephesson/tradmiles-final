import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

type Sess = {
  id: string;
  login: string;
  team: string;
  role: "admin" | "staff";
};

const MANUAL_STATUS = ["CANCELADO", "CONFIRMADO", "ALTERADO"] as const;
type ManualStatus = (typeof MANUAL_STATUS)[number];

const CANCEL_URL_PATTERNS = [
  "/minhas-viagens/error?error=order_not_found",
  "/minhas-viagens/error?error=undefined",
];

const COOKIE_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "button:has-text('Aceitar todos')",
  "button:has-text('Aceitar')",
  "button:has-text('Concordo')",
  "button:has-text('OK')",
  "button:has-text('Accept all')",
  "button:has-text('Accept')",
  "button:has-text('I agree')",
];

const BAGGAGE_MODAL_URL_HINTS = ["BaggageModal", "extraBaggageModal"];
const BAGGAGE_MODAL_TEXT =
  /não deixe faltar espaço|adicionar bagagem despachada|em outro momento/i;
const BOARDING_PASS_REGEX = /cart[aã]o de embarque/i;

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

function normalizeText(v: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function resolveBrowserlessWs() {
  const direct = String(process.env.BROWSERLESS_WS || "").trim();
  const token = String(process.env.BROWSERLESS_TOKEN || "").trim();

  const ws =
    direct ||
    (token ? `wss://production-sfo.browserless.io?token=${encodeURIComponent(token)}` : "");
  if (!ws) return "";

  try {
    const u = new URL(ws);
    if (!u.pathname) u.pathname = "/";
    if (!u.searchParams.has("stealth")) u.searchParams.set("stealth", "true");
    if (!u.searchParams.has("blockAds")) u.searchParams.set("blockAds", "true");
    return u.toString();
  } catch {
    return ws;
  }
}

function isCancelledByUrl(url: string) {
  const u = url.toLowerCase();
  return CANCEL_URL_PATTERNS.some((pattern) => u.includes(pattern));
}

function detectCancelledByText(text: string) {
  const t = normalizeText(text);
  const patterns = [
    "precisamos recarregar a informacao",
    "temos um problema",
    "nao podemos carregar suas viagens",
    "order_not_found",
  ];
  return patterns.some((p) => t.includes(p));
}

function detectCaptchaOrBlock(text: string) {
  const t = normalizeText(text);
  const patterns = [
    "captcha",
    "recaptcha",
    "verify you are human",
    "nao sou um robo",
    "access denied",
    "blocked",
    "unusual traffic",
    "bot",
  ];
  return patterns.some((p) => t.includes(p));
}

async function isVisible(locator: Locator, timeout = 1000) {
  try {
    return await locator.first().isVisible({ timeout });
  } catch {
    return false;
  }
}

async function acceptCookiesIfPresent(page: Page) {
  for (const sel of COOKIE_SELECTORS) {
    try {
      const loc = page.locator(sel);
      if ((await loc.count()) > 0 && (await isVisible(loc, 700))) {
        await loc.first().click({ timeout: 1200 });
        await page.waitForTimeout(250);
        return true;
      }
    } catch {
      // segue
    }
  }

  for (const frame of page.frames()) {
    for (const sel of COOKIE_SELECTORS) {
      try {
        const loc = frame.locator(sel);
        if ((await loc.count()) > 0 && (await isVisible(loc, 700))) {
          await loc.first().click({ timeout: 1200 });
          await page.waitForTimeout(250);
          return true;
        }
      } catch {
        // segue
      }
    }
  }
  return false;
}

async function getBodyText(page: Page) {
  try {
    return await page.locator("body").innerText({ timeout: 2500 });
  } catch {
    return "";
  }
}

async function waitForStableUrl(page: Page, maxWaitMs = 4000) {
  let last = page.url();
  let stableForMs = 0;
  const stepMs = 250;
  const maxSteps = Math.max(1, Math.floor(maxWaitMs / stepMs));

  for (let i = 0; i < maxSteps; i++) {
    await page.waitForTimeout(stepMs);
    const cur = page.url();
    if (cur === last) {
      stableForMs += stepMs;
      if (stableForMs >= 1000) break;
    } else {
      last = cur;
      stableForMs = 0;
    }
  }

  return page.url();
}

function isRetriableNavigationError(error: unknown) {
  const msg = getErrorMessage(error, "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("err_http2_protocol_error") ||
    msg.includes("err_connection_reset") ||
    msg.includes("err_incomplete_chunked_encoding") ||
    msg.includes("navigation timeout") ||
    msg.includes("target closed")
  );
}

async function gotoLatamWithRetries(page: Page, url: string, timeoutMs: number) {
  const attempts: Array<{
    warmup: boolean;
    waitUntil: "domcontentloaded" | "load";
  }> = [
    { warmup: false, waitUntil: "domcontentloaded" },
    { warmup: true, waitUntil: "domcontentloaded" },
    { warmup: true, waitUntil: "load" },
  ];

  let lastError: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      if (attempt.warmup) {
        await page
          .goto("https://www.latamairlines.com/br/pt/minhas-viagens", {
            waitUntil: "domcontentloaded",
            timeout: Math.min(12000, timeoutMs),
          })
          .catch(() => null);
        await page.waitForTimeout(450);
      }

      await page.goto(url, {
        waitUntil: attempt.waitUntil,
        timeout: timeoutMs,
      });
      return;
    } catch (error: unknown) {
      lastError = error;
      if (!isRetriableNavigationError(error)) {
        throw error;
      }
      await page.waitForTimeout(650 + i * 350);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Falha ao abrir URL LATAM após tentativas.");
}

async function detectBaggageModal(page: Page) {
  const currentUrl = page.url();
  const urlHint = BAGGAGE_MODAL_URL_HINTS.some((h) =>
    currentUrl.toLowerCase().includes(h.toLowerCase())
  );

  const textLoc = page.getByText(BAGGAGE_MODAL_TEXT);
  const textHint = (await textLoc.count()) > 0 && (await isVisible(textLoc, 900));

  if (!(urlHint || textHint)) return false;

  try {
    const laterBtn = page.getByRole("button", { name: /em outro momento/i });
    if ((await laterBtn.count()) > 0 && (await isVisible(laterBtn, 700))) {
      await laterBtn.first().click({ timeout: 1200 });
      return true;
    }
  } catch {
    // segue
  }

  try {
    await page.keyboard.press("Escape");
  } catch {
    // segue
  }

  return true;
}

async function hasBoardingPassButton(page: Page) {
  const candidates: Locator[] = [
    page.getByRole("button", { name: BOARDING_PASS_REGEX }),
    page.getByRole("link", { name: BOARDING_PASS_REGEX }),
    page.locator("button").filter({ hasText: BOARDING_PASS_REGEX }),
    page.locator("a").filter({ hasText: BOARDING_PASS_REGEX }),
    page.getByText(BOARDING_PASS_REGEX),
  ];

  for (const loc of candidates) {
    try {
      if ((await loc.count()) === 0) continue;
      if (!(await isVisible(loc, 1000))) continue;
      return true;
    } catch {
      // segue
    }
  }
  return false;
}

async function connectBrowserless(wsEndpoint: string): Promise<{ browser: Browser; context: BrowserContext }> {
  const playwright = (await import("playwright-core")) as typeof import("playwright-core");

  let browser: Browser | null = null;
  let firstError: unknown = null;

  try {
    browser = await playwright.chromium.connectOverCDP(wsEndpoint);
  } catch (error: unknown) {
    firstError = error;
  }

  if (!browser) {
    try {
      browser = await playwright.chromium.connect(wsEndpoint);
    } catch (error: unknown) {
      const first = getErrorMessage(firstError, "sem detalhe");
      const second = getErrorMessage(error, "sem detalhe");
      throw new Error(`Falha ao conectar no Browserless. CDP: ${first} | WS: ${second}`);
    }
  }

  try {
    const context = await browser.newContext({
      locale: "pt-BR",
      ignoreHTTPSErrors: true,
      viewport: { width: 1366, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    });
    return { browser, context };
  } catch {
    const existing = browser.contexts()[0];
    if (!existing) {
      throw new Error("Sessão Browserless sem contexto disponível.");
    }
    return { browser, context: existing };
  }
}

async function autoCheckLatam(params: {
  wsEndpoint: string;
  purchaseCode: string;
  lastName: string;
  timeoutMs: number;
}) {
  const checkUrl = buildLatamUrl(params.purchaseCode, params.lastName);
  let browser: Browser | null = null;
  let page: Page | null = null;
  let finalUrl = checkUrl;

  try {
    const connected = await connectBrowserless(params.wsEndpoint);
    browser = connected.browser;
    const context = connected.context;

    page = await context.newPage();
    page.setDefaultNavigationTimeout(params.timeoutMs);
    page.setDefaultTimeout(params.timeoutMs);

    await page.setExtraHTTPHeaders({
      "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    await gotoLatamWithRetries(page, checkUrl, params.timeoutMs);
    await page.waitForTimeout(850);
    await acceptCookiesIfPresent(page);

    finalUrl = await waitForStableUrl(page, 4500);
    const bodyText = await getBodyText(page);

    if (isCancelledByUrl(finalUrl) || detectCancelledByText(bodyText)) {
      return {
        status: "CANCELADO" as ManualStatus,
        finalUrl,
        note: "URL/texto indicam cancelamento na LATAM.",
      };
    }

    if (detectCaptchaOrBlock(bodyText)) {
      return {
        status: "ALTERADO" as ManualStatus,
        finalUrl,
        note: "Possível bloqueio/CAPTCHA. Revisar manualmente.",
      };
    }

    if (finalUrl.includes("/minhas-viagens/second-detail")) {
      await acceptCookiesIfPresent(page);

      const modalDetected = await detectBaggageModal(page);
      const boardingDetected = modalDetected ? true : await hasBoardingPassButton(page);

      if (modalDetected || boardingDetected) {
        return {
          status: "CONFIRMADO" as ManualStatus,
          finalUrl,
          note: modalDetected
            ? "Modal de bagagem detectado (confirma viagem ativa)."
            : "Botão 'Cartão de embarque' visível.",
        };
      }

      return {
        status: "ALTERADO" as ManualStatus,
        finalUrl,
        note: "Second-detail abriu, mas sem modal de bagagem e sem botão de embarque visível.",
      };
    }

    return {
      status: "ALTERADO" as ManualStatus,
      finalUrl,
      note: "URL final inconclusiva (fora de second-detail/error).",
    };
  } catch (error: unknown) {
    const msg = getErrorMessage(error, "Falha na checagem automática.");
    const normalized = msg.replace(/\s+/g, " ").trim().slice(0, 380);
    if (page) {
      finalUrl = page.url() || finalUrl;
    }
    return {
      status: "ALTERADO" as ManualStatus,
      finalUrl,
      note: `Falha na checagem automática: ${normalized}`,
    };
  } finally {
    try {
      await page?.close();
    } catch {
      // segue
    }
    try {
      await browser?.close();
    } catch {
      // segue
    }
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
  const action = String(body?.action || "").trim().toUpperCase();
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

  if (action === "AUTO") {
    const purchaseCode = String(sale.purchaseCode || "").trim();
    const lastName = String(sale.firstPassengerLastName || "").trim();
    if (!purchaseCode || !lastName) {
      return NextResponse.json(
        { ok: false, error: "Venda sem código LA e/ou sobrenome do primeiro passageiro." },
        { status: 400 }
      );
    }

    const wsEndpoint = resolveBrowserlessWs();
    if (!wsEndpoint) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Browserless não configurado. Defina BROWSERLESS_WS (ou BROWSERLESS_TOKEN) no ambiente do deploy.",
        },
        { status: 400 }
      );
    }

    const timeoutMs = Math.max(15000, Math.min(45000, Number(body?.timeoutMs) || 25000));
    const result = await autoCheckLatam({
      wsEndpoint,
      purchaseCode,
      lastName,
      timeoutMs,
    });

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: {
        latamLocatorCheckStatus: result.status,
        latamLocatorCheckedAt: new Date(),
        latamLocatorCheckNote: result.note,
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
      auto: true,
      row: {
        ...updated,
        latamLocatorCheckedAt: updated.latamLocatorCheckedAt
          ? updated.latamLocatorCheckedAt.toISOString()
          : null,
      },
      debug: {
        checkUrl: buildLatamUrl(purchaseCode, lastName),
        finalUrl: result.finalUrl,
      },
    });
  }

  if (!statusRaw) {
    return NextResponse.json(
      { ok: false, error: "Informe o status manual ou action=AUTO." },
      { status: 400 }
    );
  }

  if (!MANUAL_STATUS.includes(status)) {
    return NextResponse.json({ ok: false, error: "Status manual inválido." }, { status: 400 });
  }

  const updated = await prisma.sale.update({
    where: { id: saleId },
    data: {
      latamLocatorCheckStatus: status,
      latamLocatorCheckedAt: new Date(),
      latamLocatorCheckNote: "Atualização manual.",
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
    auto: false,
    row: {
      ...updated,
      latamLocatorCheckedAt: updated.latamLocatorCheckedAt
        ? updated.latamLocatorCheckedAt.toISOString()
        : null,
    },
  });
}
