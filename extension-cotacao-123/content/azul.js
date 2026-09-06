const runKey = `tmazul:${location.href}`;
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
  const m = String(s || "").match(/R\$\s*[\d.]+,\d{2}|R\$\s*\d+\.\d{2}|R\$\s*[\d.,]+/);
  if (!m) return 0;
  let v = m[0].replace("R$", "").trim();
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d+\.\d{2}$/.test(v)) {
    /* 2680.78 */
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
  const mOnly = t.match(/(\d+)\s*m(?:in)?/i);
  if (hOnly && mOnly) return Number(hOnly[1]) * 60 + Number(mOnly[1]);
  if (hOnly) return Number(hOnly[1]) * 60;
  if (mOnly) return Number(mOnly[1]);
  return 0;
}

function parseStops(text) {
  const t = String(text || "");
  if (/direto|sem\s+parada|sem\s+escala|non[-\s]?stop|sem\s+conex/i.test(t)) return 0;
  const n =
    t.match(/(\d+)\s*(conex[oõ]es?|connections?|paradas?|escalas?)/i) || t.match(/(\d+)\s*connection/i);
  if (n) return Number(n[1]);
  if (/conex|parada|escala/i.test(t)) return 1;
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

function moreFlightsButton() {
  return [...document.querySelectorAll("button, a")].find((el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!/ver\s+mais\s+voos/i.test(t)) return false;
    if (el.disabled) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  });
}

async function expandAllFlights() {
  for (let n = 0; n < 15; n++) {
    const btn = moreFlightsButton();
    if (!btn) break;
    const before = flightCards().length;
    btn.click();
    await sleep(1400);
    const after = flightCards().length;
    if (after <= before) {
      await sleep(900);
      if (flightCards().length <= before && !moreFlightsButton()) break;
      if (flightCards().length <= before && n > 1) break;
    }
  }
}

function parseMiles(s) {
  const t = String(s || "").replace(/\s+/g, " ");
  const m = t.match(/(\d{1,3}(?:\.\d{3})+|\d{3,7})\s*(pontos|pts|milhas)/i);
  if (!m) return 0;
  const n = Number(m[1].replace(/\./g, ""));
  return Number.isFinite(n) && n >= 500 ? n : 0;
}

function isPts() {
  return /[?&]cc=PTS/i.test(location.search || "");
}

function priceNodes() {
  return [...document.querySelectorAll("div, span, p, button, strong, li")].filter((el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length > 90) return false;
    if (isPts()) return parseMiles(t) > 0 || /a\s+partir\s+de/i.test(t) && parseMiles(t) > 0;
    return (/a\s+partir\s+de\s+R\$/i.test(t) || /R\$/.test(t)) && moneyToCents(t) > 0;
  });
}

function flightCards() {
  const cards = [];
  for (const p of priceNodes()) {
    let el = p;
    for (let i = 0; i < 14 && el; i++) {
      const t = el.innerText || "";
      const times = [...t.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((m) => parseClock(m[1])).filter(Boolean);
      if (times.length >= 2 && t.length < 2500) {
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
  const rawMatch = isPts()
    ? text.match(/(\d{1,3}(?:\.\d{3})+|\d{3,7})\s*(pontos|pts|milhas)/i)
    : text.match(/a\s+partir\s+de\s+R\$\s*[\d.,]+/i) || text.match(/R\$\s*[\d.,]+/);
  return {
    cents,
    miles: parseMiles(text),
    raw: rawMatch ? rawMatch[0] : text.slice(0, 180),
    depTime: times[0] || "",
    arrTime: times[1] || "",
    durationMin: parseDurationMin(text),
    stops: parseStops(text),
    airline: "AZUL",
  };
}

function pickBestCard(filters) {
  let best = null;
  const pts = isPts();
  for (const el of flightCards()) {
    const card = parseCard(el);
    if (pts) {
      if (!card.miles) continue;
      if (!matchesFilter(card, filters)) continue;
      if (!best || card.miles < best.miles) best = card;
    } else {
      if (!card.cents) continue;
      if (!matchesFilter(card, filters)) continue;
      if (!best || card.cents < best.cents) best = card;
    }
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

function isAzulSearch() {
  return /voeazul\.com\.br/i.test(location.hostname || "") && /selecao-voo/i.test(location.pathname || "");
}

function pageKind() {
  const t = (document.body?.innerText || "").slice(0, 9000);
  if (/acesso\s+negado|are\s+you\s+human|captcha/i.test(t)) return "BLOCKED";
  if (/n[aã]o\s+encontramos\s+voo|nenhum\s+voo\s+dispon|sem\s+voo\s+dispon/i.test(t)) {
    return "NO_RESULTS";
  }
  if (flightCards().length > 0) return "RESULTS";
  if (isPts() && /(pontos|pts|milhas)/i.test(t) && /\d{1,2}:\d{2}/.test(t)) return "RESULTS";
  if (/a\s+partir\s+de\s+R\$/i.test(t) && /\d{1,2}:\d{2}/.test(t)) return "RESULTS";
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
  let expanded = false;
  while (Date.now() - t0 < 70000) {
    const kind = pageKind();
    if (kind === "BLOCKED") return { cents: 0, error: "A Azul bloqueou a página (captcha ou acesso)." };
    if (kind === "NO_RESULTS" && Date.now() - t0 > 12000) {
      return { cents: 0, error: "Azul sem voos neste trecho/data." };
    }
    if (kind === "RESULTS") {
      sawResults = true;
      if (!expanded) {
        await expandAllFlights();
        expanded = true;
      }
      const best = pickBestCard(filters);
      if ((best?.cents > 0 || best?.miles > 0) && !moreFlightsButton()) return best;
      if ((best?.cents > 0 || best?.miles > 0) && Date.now() - t0 > 25000) return best;
    }
    await sleep(800);
  }
  const last = pickBestCard(filters);
  if (last?.cents > 0 || last?.miles > 0) return last;
  return {
    cents: 0,
    miles: 0,
    error: sawResults
      ? hasActiveFilters(filters)
        ? "Nenhum voo bate com os filtros (horário, duração ou direto)."
        : "Resultados carregaram, mas não achei o preço na Azul."
      : "Não achei o preço na Azul.",
  };
}

async function run() {
  const t0 = Date.now();
  while (!isAzulSearch() && Date.now() - t0 < 12000) await sleep(400);
  if (!isAzulSearch()) {
    sendResult({ ok: false, airline: "AZUL", error: "Não abriu a busca da Azul." });
    return;
  }

  const filters = await loadFilters();
  const pts = isPts();
  const price = await scrape(filters);
  const ok = pts ? price.miles > 0 : price.cents > 0;
  sendResult({
    ok,
    priceCents: price.cents || 0,
    miles: price.miles || 0,
    airline: pts ? "Azul milhas" : "AZUL",
    rawPrice: price.raw || "",
    depTime: price.depTime || "",
    arrTime: price.arrTime || "",
    durationMin: price.durationMin || 0,
    stops: price.stops,
    error: ok ? "" : price.error || (pts ? "Não achei as milhas na Azul." : "Não achei o preço na Azul."),
  });
}
