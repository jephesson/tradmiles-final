const runKey = `tmlatam:${location.href}`;
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
      if (Date.now() - t0 < 8000) setTimeout(tick, 350);
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
    /* 337.59 */
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
  const n = t.match(/(\d+)\s*(paradas?|escalas?|conex[oõ]es?|connections?)/i);
  if (n) return Number(n[1]);
  if (/parada|escala|conex/i.test(t)) return 1;
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

function priceNodes() {
  return [...document.querySelectorAll("div, span, p, button, strong, li")].filter((el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length > 80) return false;
    return /(?:R\$|BRL)\s*[\d.,]+/i.test(t) && moneyToCents(t) > 0;
  });
}

function flightCards() {
  const cards = [];
  for (const p of priceNodes()) {
    let el = p;
    for (let i = 0; i < 14 && el; i++) {
      const t = el.innerText || "";
      const times = [...t.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((m) => parseClock(m[1])).filter(Boolean);
      if (times.length >= 2 && t.length < 2200) {
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
  const cents = moneyToCents(text);
  const times = [...text.matchAll(/\b(\d{1,2}:\d{2})\b/g)]
    .map((m) => parseClock(m[1]))
    .filter(Boolean);
  const rawMatch = text.match(/(?:R\$|BRL)\s*[\d.,]+/i);
  return {
    cents,
    raw: rawMatch ? rawMatch[0] : text.slice(0, 180),
    depTime: times[0] || "",
    arrTime: times[1] || "",
    durationMin: parseDurationMin(text),
    stops: parseStops(text),
    airline: "LATAM",
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
    if (/^(aceitar(\s+(todos|cookies))?|concordar)$/i.test(t)) el.click();
  }
}

async function clickMaisBaratos() {
  const open = [...document.querySelectorAll("button, [role='button'], select, div")].find((el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    return t.length < 80 && /organizar\s+por/i.test(t);
  });
  if (open) {
    open.click();
    await sleep(450);
  }
  const opt = [...document.querySelectorAll("button, li, [role='option'], span, div, a")].find((el) =>
    /^mais\s+baratos$/i.test((el.textContent || "").trim())
  );
  if (opt) {
    opt.click();
    await sleep(1000);
  }
}

function isLatamSearch() {
  return /latamairlines\.com/i.test(location.hostname || "") && /oferta-voos/i.test(location.pathname || "");
}

function pageKind() {
  const t = (document.body?.innerText || "").slice(0, 9000);
  if (/acesso\s+negado|are\s+you\s+human|captcha/i.test(t)) return "BLOCKED";
  if (/n[aã]o\s+(foi\s+)?poss[ií]vel|n[aã]o\s+encontramos\s+voo|nenhum\s+voo|sem\s+voo\s+dispon/i.test(t)) {
    return "NO_RESULTS";
  }
  if (flightCards().length > 0) return "RESULTS";
  if (/escolha\s+um\s+voo|organizar\s+por/i.test(t) && /\d{1,2}:\d{2}/.test(t)) return "RESULTS";
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
  await sleep(700);
  dismissCookies();

  const t0 = Date.now();
  let sawResults = false;
  while (Date.now() - t0 < 50000) {
    const kind = pageKind();
    if (kind === "BLOCKED") return { cents: 0, error: "A LATAM bloqueou a página (captcha ou acesso)." };
    if (kind === "NO_RESULTS" && Date.now() - t0 > 10000) {
      return { cents: 0, error: "LATAM sem voos neste trecho/data." };
    }
    if (kind === "RESULTS") {
      sawResults = true;
      await clickMaisBaratos();
      const best = pickBestCard(filters);
      if (best?.cents > 0) {
        await sleep(400);
        return pickBestCard(filters) || best;
      }
    }
    await sleep(800);
  }
  const last = pickBestCard(filters);
  if (last?.cents > 0) return last;
  return {
    cents: 0,
    error: sawResults
      ? hasActiveFilters(filters)
        ? "Nenhum voo bate com os filtros (horário, duração ou direto)."
        : "Resultados carregaram, mas não achei o preço na LATAM."
      : "Não achei o preço na LATAM.",
  };
}

async function run() {
  const t0 = Date.now();
  while (!isLatamSearch() && Date.now() - t0 < 12000) await sleep(400);
  if (!isLatamSearch()) {
    sendResult({ ok: false, airline: "LATAM", error: "Não abriu a busca da LATAM." });
    return;
  }

  const filters = await loadFilters();
  const price = await scrape(filters);
  sendResult({
    ok: price.cents > 0,
    priceCents: price.cents || 0,
    airline: "LATAM",
    rawPrice: price.raw || "",
    depTime: price.depTime || "",
    arrTime: price.arrTime || "",
    durationMin: price.durationMin || 0,
    stops: price.stops,
    error: price.cents > 0 ? "" : price.error || "Não achei o preço na LATAM.",
  });
}
