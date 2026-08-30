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

function parseClock(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function clockToMin(hhmm) {
  const c = parseClock(hhmm);
  if (!c) return null;
  const [h, m] = c.split(":").map(Number);
  return h * 60 + m;
}

function parseDurationMin(text) {
  const t = String(text || "");
  const hm = t.match(/(\d+)\s*h(?:oras?)?\s*(?:e\s*)?(\d+)\s*min/i);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const hOnly = t.match(/(\d+)\s*h(?:oras?)?(?!\s*\d)/i);
  const mOnly = t.match(/(\d+)\s*min/i);
  if (hOnly && mOnly) return Number(hOnly[1]) * 60 + Number(mOnly[1]);
  if (hOnly) return Number(hOnly[1]) * 60;
  if (mOnly) return Number(mOnly[1]);
  return 0;
}

function parseStops(text) {
  const t = String(text || "");
  if (/direto|sem\s+parada|sem\s+escala|non[-\s]?stop/i.test(t)) return 0;
  const n = t.match(/(\d+)\s*paradas?/i) || t.match(/(\d+)\s*escalas?/i);
  if (n) return Number(n[1]);
  if (/parada|escala/i.test(t)) return 1;
  return null;
}

function hasActiveFilters(f) {
  return Boolean(f && (f.maxDurationMin > 0 || f.depFrom || f.depTo || f.directOnly));
}

function depInWindow(depMin, from, to) {
  if (depMin == null) return false;
  const a = clockToMin(from);
  const b = clockToMin(to);
  if (a == null && b == null) return true;
  if (a != null && b == null) return depMin >= a;
  if (a == null && b != null) return depMin <= b;
  if (a <= b) return depMin >= a && depMin <= b;
  return depMin >= a || depMin <= b;
}

function matchesFilter(card, f) {
  if (!hasActiveFilters(f)) return true;
  if (f.maxDurationMin > 0) {
    if (!card.durationMin || card.durationMin > f.maxDurationMin) return false;
  }
  if (f.depFrom || f.depTo) {
    const dep = clockToMin(card.depTime);
    if (!depInWindow(dep, f.depFrom, f.depTo)) return false;
  }
  if (f.directOnly && card.stops !== 0) return false;
  return true;
}

function outermostCards() {
  const all = [...document.querySelectorAll("[class*='renewed-flight-card'], [class*='FlightCard']")];
  const scoped = all.length
    ? all
    : [...document.querySelectorAll("[class*='flight-card']")];
  return scoped.filter((el) => !scoped.some((o) => o !== el && o.contains(el)));
}

function pixFromCard(el) {
  const labels = el.querySelectorAll(
    "span.renewed-flight-card__total--container__text, [class*='total--container__text']"
  );
  for (const lab of labels) {
    if (!/total\s+no\s+pix/i.test(lab.textContent || "")) continue;
    const value =
      lab.parentElement?.querySelector(
        "span.renewed-flight-card__total--container__value, [class*='total--container__value']"
      ) || lab.nextElementSibling;
    const cents = moneyToCents(value?.textContent || lab.parentElement?.innerText || "");
    if (cents > 0) return { cents, raw: (value?.textContent || "").trim() };
  }
  const text = el.innerText || "";
  if (!/total\s+no\s+pix|\bno\s+pix\b/i.test(text) || looksInstallment(text)) {
    return { cents: 0, raw: "" };
  }
  const cents = moneyToCents(text);
  return { cents, raw: text.slice(0, 180) };
}

function parseCard(el) {
  const text = el.innerText || "";
  const pix = pixFromCard(el);
  const times = [...text.matchAll(/\b(\d{1,2}:\d{2})\b/g)]
    .map((m) => parseClock(m[1]))
    .filter(Boolean);
  const numEl = el.querySelector("span.flight-time__flight-number, [class*='flight-number']");
  return {
    cents: pix.cents,
    raw: pix.raw,
    depTime: times[0] || "",
    arrTime: times[1] || "",
    durationMin: parseDurationMin(text),
    stops: parseStops(text),
    airline: airlineFromText(numEl?.textContent || text),
  };
}

function pickBestCard(filters) {
  let best = null;
  for (const el of outermostCards()) {
    const card = parseCard(el);
    if (!card.cents) continue;
    if (!matchesFilter(card, filters)) continue;
    if (!best || card.cents < best.cents) best = card;
  }
  return best;
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

async function loadFilters() {
  const h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  const fromHash = {
    maxDurationMin: Number(h.get("maxDur") || 0) || 0,
    depFrom: parseClock(h.get("depFrom") || ""),
    depTo: parseClock(h.get("depTo") || ""),
    directOnly: h.get("direct") === "1",
  };
  try {
    const st = await chrome.storage.local.get(["tmFilters"]);
    const f = st.tmFilters || {};
    return {
      maxDurationMin: fromHash.maxDurationMin || Number(f.maxDurationMin) || 0,
      depFrom: fromHash.depFrom || parseClock(f.depFrom || ""),
      depTo: fromHash.depTo || parseClock(f.depTo || ""),
      directOnly: fromHash.directOnly || Boolean(f.directOnly),
    };
  } catch {
    return fromHash;
  }
}

async function scrape(filters) {
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
      if (!hasActiveFilters(filters)) selectFirstFlight();
      const best = pickBestCard(filters);
      if (best?.cents > 0) {
        await sleep(400);
        return pickBestCard(filters) || best;
      }
      if (!hasActiveFilters(filters)) {
        const price = extractPrice();
        if (price.cents > 0) {
          await sleep(500);
          const again = extractPrice();
          if (again.cents > 0) {
            return { ...again, airline: extractAirline() };
          }
        }
      }
    }
    await sleep(800);
  }
  const last = pickBestCard(filters);
  if (last?.cents > 0) return last;
  if (!hasActiveFilters(filters)) {
    const price = extractPrice();
    if (price.cents > 0) return { ...price, airline: extractAirline() };
  }
  return {
    cents: 0,
    error: sawResults
      ? hasActiveFilters(filters)
        ? "Nenhum voo bate com os filtros (horário, duração ou direto)."
        : "Resultados carregaram, mas não achei o Pix."
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

  const filters = await loadFilters();
  const price = await scrape(filters);
  sendResult({
    ok: price.cents > 0,
    priceCents: price.cents || 0,
    airline: price.airline || (price.cents > 0 ? extractAirline() : ""),
    rawPrice: price.raw || "",
    depTime: price.depTime || "",
    arrTime: price.arrTime || "",
    durationMin: price.durationMin || 0,
    stops: price.stops,
    error: price.cents > 0 ? "" : price.error || "Não achei o preço no 123milhas.",
  });
}
