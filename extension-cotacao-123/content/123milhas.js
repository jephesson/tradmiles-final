if (window.__tmCotacao123) {
  /* already running */
} else {
  window.__tmCotacao123 = true;
  run();
}

function searchIdFromLocation() {
  try {
    const u = new URL(location.href);
    return u.searchParams.get("tmSearch") || (u.hash.match(/tmSearch=([^&]+)/) || [])[1] || "";
  } catch {
    return "";
  }
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

function clickIf(selector) {
  const el = document.querySelector(selector);
  if (el) {
    el.click();
    return true;
  }
  return false;
}

function clickByText(re) {
  const nodes = document.querySelectorAll("button, a, span, div");
  for (const el of nodes) {
    const t = (el.textContent || "").trim();
    if (t.length > 40) continue;
    if (re.test(t)) {
      el.click();
      return true;
    }
  }
  return false;
}

function dismissNoise() {
  clickIf("#ensAcceptAll");
  clickIf("#onetrust-accept-btn-handler");
  clickByText(/^(aceitar(\s+todos)?|concordar|aplicar|continuar sem (login|cadastro)|agora não|fechar)$/i);
}

function clickMenorPreco() {
  const nodes = document.querySelectorAll("button, span, div, label");
  for (const el of nodes) {
    if (/^MENOR\s+PREÇO$/i.test((el.textContent || "").trim())) {
      el.click();
      return;
    }
  }
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

  const labels = Array.from(document.querySelectorAll("span, div, p")).filter((el) =>
    /total\s+no\s+pix/i.test(el.textContent || "")
  );
  for (const el of labels) {
    const row = el.closest("div, section, article, li") || el.parentElement;
    const txt = row?.innerText || "";
    if (looksInstallment(txt) && !/total\s+no\s+pix/i.test(txt)) continue;
    const cents = moneyToCents(txt);
    if (cents > 0) return { cents, raw: txt.slice(0, 180) };
  }

  let best = 0;
  let raw = "";
  const pix = Array.from(document.querySelectorAll("span, div")).filter((el) =>
    /\bno\s+pix\b/i.test(el.textContent || "")
  );
  for (const el of pix.slice(0, 40)) {
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

function noResults() {
  const t = (document.body?.innerText || "").slice(0, 4000);
  return /não\s+encontramos\s+voos|nenhum\s+voo\s+encontrado|sem\s+resultados/i.test(t);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForSearchPage(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (isSearchPage()) return true;
    await sleep(400);
  }
  return isSearchPage();
}

async function scrape() {
  dismissNoise();
  await sleep(800);
  dismissNoise();
  clickMenorPreco();

  const t0 = Date.now();
  let last = { cents: 0, raw: "" };
  while (Date.now() - t0 < 42000) {
    dismissNoise();
    last = extractPrice();
    if (last.cents > 0) {
      await sleep(700);
      const again = extractPrice();
      if (again.cents > 0) return again;
    }
    if (noResults() && Date.now() - t0 > 8000) {
      return { cents: 0, raw: "", error: "123milhas sem voos neste trecho/data." };
    }
    await sleep(900);
  }
  return last.cents > 0 ? last : { cents: 0, raw: "", error: "Não achei o preço no 123milhas." };
}

async function run() {
  const okPage = await waitForSearchPage(12000);
  if (!okPage) return;

  const price = await scrape();
  const airline = price.cents > 0 ? extractAirline() : "";
  chrome.runtime.sendMessage({
    type: "TM_COTACAO_RESULT",
    searchId: searchIdFromLocation(),
    ok: price.cents > 0,
    priceCents: price.cents,
    airline,
    rawPrice: price.raw || "",
    error: price.cents > 0 ? "" : price.error || "Não achei o preço no 123milhas.",
  });
}
