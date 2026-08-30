const runKey = `tm123:${location.href}`;
if (sessionStorage.getItem(runKey)) {
  /* already scraping this URL */
} else {
  sessionStorage.setItem(runKey, "1");
  run();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function moneyToCents(s) {
  const m = String(s || "").match(/R\$\s*[\d.]+,\d{2}|R\$\s*[\d.,]+/);
  if (!m) return 0;
  const v = m[0].replace("R$", "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function looksInstallment(text) {
  return /\d+\s*x\s*(de\s*)?R\$|parcela/i.test(text || "");
}

function airlineFromText(text) {
  const t = String(text || "").toUpperCase();
  const m = t.match(/\bVOO\s+([A-Z0-9]{2})\s*[- ]?\s*\d+\b/);
  const code = m?.[1] || "";
  if (code === "G3") return "GOL";
  if (code === "AD") return "AZUL";
  if (code === "LA" || code === "JJ") return "LATAM";
  if (t.includes("GOL")) return "GOL";
  if (t.includes("AZUL")) return "AZUL";
  if (t.includes("LATAM")) return "LATAM";
  return "";
}

function dismissCookies() {
  document.querySelector("#ensAcceptAll")?.click();
  document.querySelector("#onetrust-accept-btn-handler")?.click();
  for (const el of document.querySelectorAll("button, a")) {
    const t = (el.textContent || "").trim();
    if (/^(aceitar(\s+todos)?|concordar)$/i.test(t)) el.click();
  }
}

function clickMenorPreco() {
  for (const el of document.querySelectorAll("button, span, div, label")) {
    if (/^MENOR\s+PREÇO$/i.test((el.textContent || "").trim())) {
      el.click();
      return;
    }
  }
}

function selectFirstFlight() {
  const radio = document.querySelector("input[type='radio']");
  if (radio) {
    radio.click();
    return;
  }
  const card = document.querySelector("[class*='flight-card'], [class*='renewed-flight-card']");
  if (card) card.click();
}

function extractPrice() {
  const totalLabels = document.querySelectorAll(
    "span.renewed-flight-card__total--container__text, [class*='total--container__text']"
  );
  for (const el of totalLabels) {
    if (!/total\s+no\s+pix/i.test(el.textContent || "")) continue;
    const value =
      el.parentElement?.querySelector(
        "span.renewed-flight-card__total--container__value, [class*='total--container__value']"
      ) || el.nextElementSibling;
    const cents = moneyToCents(value?.textContent || el.parentElement?.innerText || "");
    if (cents > 0) return { cents, raw: (value?.textContent || "").trim() };
  }

  for (const el of document.querySelectorAll("span, div, p")) {
    if (!/total\s+no\s+pix/i.test(el.textContent || "")) continue;
    const row = el.closest("div, section, article, li") || el.parentElement;
    const cents = moneyToCents(row?.innerText || "");
    if (cents > 0) return { cents, raw: (row?.innerText || "").slice(0, 180) };
  }

  let best = 0;
  let raw = "";
  for (const el of document.querySelectorAll("span, div")) {
    if (!/\bno\s+pix\b/i.test(el.textContent || "")) continue;
    const txt = el.parentElement?.innerText || el.innerText || "";
    if (looksInstallment(txt)) continue;
    const cents = moneyToCents(txt);
    if (cents > 0 && (!best || cents < best)) {
      best = cents;
      raw = txt.slice(0, 180);
    }
  }
  return { cents: best, raw };
}

function extractAirline() {
  const nodes = document.querySelectorAll("span.flight-time__flight-number, [class*='flight-number']");
  for (const n of nodes) {
    const cia = airlineFromText(n.textContent || n.parentElement?.innerText || "");
    if (cia) return cia;
  }
  return airlineFromText(document.body?.innerText?.slice(0, 8000) || "");
}

function isSearchPage() {
  return /\/v2\/busca|\/busca/.test(location.pathname || "") || /[?&]de=/.test(location.search || "");
}

function pageKind() {
  const t = (document.body?.innerText || "").slice(0, 6000);
  if (/não\s+encontramos\s+voos|nenhum\s+voo|sem\s+resultados/i.test(t)) return "NO_RESULTS";
  if (/MENOR\s+PREÇO|RECOMENDADO|MENOR\s+DURAÇÃO|NOVA\s+BUSCA/i.test(t)) return "RESULTS";
  return "WAIT";
}

function sendResult(payload) {
  chrome.runtime.sendMessage({ type: "TM_COTACAO_RESULT", ...payload }, () => {
    void chrome.runtime.lastError;
  });
}

async function scrape() {
  dismissCookies();
  await sleep(600);
  dismissCookies();

  const t0 = Date.now();
  let sawResults = false;
  while (Date.now() - t0 < 45000) {
    const kind = pageKind();
    if (kind === "NO_RESULTS" && Date.now() - t0 > 8000) {
      return { cents: 0, error: "123milhas sem voos neste trecho/data." };
    }
    if (kind === "RESULTS") {
      sawResults = true;
      clickMenorPreco();
      selectFirstFlight();
      const price = extractPrice();
      if (price.cents > 0) {
        await sleep(500);
        const again = extractPrice();
        if (again.cents > 0) return again;
      }
    }
    await sleep(800);
  }
  const last = extractPrice();
  if (last.cents > 0) return last;
  return {
    cents: 0,
    error: sawResults
      ? "Resultados carregaram, mas não achei o Pix."
      : "Não achei o preço no 123milhas.",
  };
}

async function run() {
  const t0 = Date.now();
  while (!isSearchPage() && Date.now() - t0 < 10000) await sleep(400);
  if (!isSearchPage()) {
    sendResult({ ok: false, error: "Não abriu a busca do 123milhas." });
    return;
  }

  const price = await scrape();
  sendResult({
    ok: price.cents > 0,
    priceCents: price.cents || 0,
    airline: price.cents > 0 ? extractAirline() : "",
    rawPrice: price.raw || "",
    error: price.cents > 0 ? "" : price.error || "Não achei o preço no 123milhas.",
  });
}
