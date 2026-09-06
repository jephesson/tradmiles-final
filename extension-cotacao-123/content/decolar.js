const runKey = `tmdecolar:${location.href}`;
if (!sessionStorage.getItem(runKey)) {
  waitAndRun(runKey, run);
}

function waitAndRun(key, fn) {
  const t0 = Date.now();
  const tick = () => {
    chrome.runtime.sendMessage({ type: "TM_COTACAO_SHOULD_SCRAPE" }, (res) => {
      if (res?.ok) {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
        fn();
        return;
      }
      if (Date.now() - t0 < 12000) setTimeout(tick, 250);
    });
  };
  tick();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function moneyToCents(s) {
  const m = String(s || "").match(/(?:R\$|BRL)\s*[\d.]+,\d{2}|(?:R\$|BRL)\s*\d+\.\d{2}|(?:R\$|BRL)\s*[\d.,]+/i);
  if (!m) return 0;
  let v = m[0].replace(/R\$|BRL/i, "").trim();
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d+\.\d{2}$/.test(v)) {
    /* ok */
  } else v = v.replace(/\./g, "");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
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
  const hm = t.match(/(\d+)\s*h(?:oras?)?\s*(?:e\s*)?(\d+)\s*m(?:in)?/i);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const compact = t.match(/(\d+)\s*h\s*(\d{2})\b/i);
  if (compact) return Number(compact[1]) * 60 + Number(compact[2]);
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
  const n = t.match(/(\d+)\s*(paradas?|escalas?|conex[oõ]es?)/i);
  if (n) return Number(n[1]);
  if (/parada|escala|conex/i.test(t)) return 1;
  return null;
}

function carrierFromText(text) {
  const t = String(text || "").toUpperCase();
  if (/\bGOL\b|\bG3\b|VOEGOL/.test(t)) return "GOL";
  if (/\bAZUL\b/.test(t)) return "AZUL";
  if (/\bLATAM\b|\bLA\b|\bJJ\b/.test(t)) return "LATAM";
  return "";
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

function priceNodes() {
  return [...document.querySelectorAll(".amount.price-amount, .price-amount, span, em, p")].filter((el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length > 80) return false;
    return moneyToCents(t) > 0 || /^\d{2,5}$/.test(t);
  });
}

function amountToCents(el) {
  const t = (el.textContent || "").replace(/\s+/g, " ").trim();
  const via = moneyToCents(t);
  if (via) return via;
  if (/^\d{2,5}$/.test(t)) return Number(t) * 100;
  return 0;
}

function flightCards() {
  const cards = [];
  for (const p of priceNodes()) {
    if (!amountToCents(p) && !moneyToCents(p.textContent || "")) continue;
    let el = p;
    for (let i = 0; i < 16 && el; i++) {
      const t = el.innerText || "";
      const times = [...t.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((m) => parseClock(m[1])).filter(Boolean);
      if (times.length >= 2 && t.length < 2800) {
        cards.push(el);
        break;
      }
      el = el.parentElement;
    }
  }
  const unique = [...new Set(cards)];
  return unique.filter((el) => !unique.some((o) => o !== el && o.contains(el)));
}

function parseCard(el) {
  const text = el.innerText || "";
  const amount = el.querySelector?.(".amount.price-amount, .price-amount");
  const cents = (amount && amountToCents(amount)) || moneyToCents(text);
  const times = [...text.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((m) => parseClock(m[1])).filter(Boolean);
  const rawMatch = text.match(/(?:R\$|BRL)\s*[\d.,]+/i);
  return {
    cents,
    raw: rawMatch ? rawMatch[0] : text.slice(0, 180),
    depTime: times[0] || "",
    arrTime: times[1] || "",
    durationMin: parseDurationMin(text),
    stops: parseStops(text),
    carrier: carrierFromText(text),
  };
}

function pickBestCard(filters) {
  let best = null;
  for (const el of flightCards()) {
    const card = parseCard(el);
    if (!card.cents) continue;
    if (!matchesFilter(card, filters)) continue;
    if (!best || card.cents < best.cents) best = card;
  }
  return best;
}

function dismissCookies() {
  document.querySelector("#onetrust-accept-btn-handler")?.click();
  for (const el of document.querySelectorAll("button, a")) {
    const t = (el.textContent || "").trim();
    if (/^(aceitar(\s+(todos|cookies))?|concordar|aceptar)$/i.test(t)) el.click();
  }
}

function isDecolarSearch() {
  return /decolar\.com/i.test(location.hostname || "") && /\/flights\/results/i.test(location.pathname || "");
}

function pageKind() {
  const t = (document.body?.innerText || "").slice(0, 9000);
  if (/acesso\s+negado|are\s+you\s+human|captcha/i.test(t)) return "BLOCKED";
  if (/n[aã]o\s+h[aá]\s+voo|sem\s+resultados|no\s+encontramos\s+vuelos|nenhum\s+voo\s+dispon/i.test(t)) {
    return "NO_RESULTS";
  }
  if (/\d{1,2}:\d{2}/.test(t) && /(R\$|BRL|pre[cç]o por adulto)/i.test(t)) return "RESULTS";
  return "WAIT";
}

function sendResult(payload) {
  chrome.runtime.sendMessage({ type: "TM_COTACAO_RESULT", ...payload }, () => {
    void chrome.runtime.lastError;
  });
}

async function loadFilters() {
  try {
    const st = await chrome.storage.local.get(["tmFilters"]);
    const f = st.tmFilters || {};
    return {
      maxDurationMin: Number(f.maxDurationMin) || 0,
      depFrom: parseClock(f.depFrom || ""),
      depTo: parseClock(f.depTo || ""),
      directOnly: Boolean(f.directOnly),
    };
  } catch {
    return { maxDurationMin: 0, depFrom: "", depTo: "", directOnly: false };
  }
}

async function scrape(filters) {
  dismissCookies();
  const t0 = Date.now();
  let sawResults = false;
  while (Date.now() - t0 < 40000) {
    const kind = pageKind();
    if (kind === "BLOCKED") return { cents: 0, error: "O Decolar bloqueou a página (captcha ou acesso)." };
    if (kind === "NO_RESULTS" && Date.now() - t0 > 12000) {
      return { cents: 0, error: "Decolar sem voos neste trecho/data." };
    }
    if (kind === "RESULTS") {
      sawResults = true;
      const best = pickBestCard(filters);
      if (best?.cents > 0) return best;
    }
    await sleep(400);
  }
  const last = pickBestCard(filters);
  if (last?.cents > 0) return last;
  return {
    cents: 0,
    error: sawResults
      ? hasActiveFilters(filters)
        ? "Nenhum voo bate com os filtros (horário, duração ou direto)."
        : "Resultados carregaram, mas não achei o preço no Decolar."
      : "Não achei o preço no Decolar.",
  };
}

async function run() {
  const t0 = Date.now();
  while (!isDecolarSearch() && Date.now() - t0 < 10000) await sleep(300);
  if (!isDecolarSearch()) {
    sendResult({ ok: false, airline: "Decolar", error: "Não abriu a busca do Decolar." });
    return;
  }
  const filters = await loadFilters();
  const price = await scrape(filters);
  sendResult({
    ok: price.cents > 0,
    priceCents: price.cents || 0,
    airline: "Decolar",
    carrier: price.carrier || "",
    rawPrice: price.raw || "",
    depTime: price.depTime || "",
    arrTime: price.arrTime || "",
    durationMin: price.durationMin || 0,
    stops: price.stops,
    error: price.cents > 0 ? "" : price.error || "Não achei o preço no Decolar.",
  });
}
