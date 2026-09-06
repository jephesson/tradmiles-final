const runKey = `tmsmiles:${location.href}`;
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

function parseMiles(s) {
  const t = String(s || "").replace(/\s+/g, " ");
  const m = t.match(/(\d{1,3}(?:\.\d{3})+|\d{3,7})\s*(milhas|smiles)/i);
  if (!m) return 0;
  const n = Number(m[1].replace(/\./g, ""));
  return Number.isFinite(n) && n >= 500 ? n : 0;
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

function mileNodes() {
  return [...document.querySelectorAll("div, span, p, button, strong, li")].filter((el) => {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length > 80) return false;
    return parseMiles(t) > 0;
  });
}

function flightCards() {
  const cards = [];
  for (const p of mileNodes()) {
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
  const times = [...text.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((m) => parseClock(m[1])).filter(Boolean);
  const rawMatch = text.match(/(\d{1,3}(?:\.\d{3})+|\d{3,7})\s*(milhas|smiles)/i);
  return {
    miles: parseMiles(text),
    raw: rawMatch ? rawMatch[0] : text.slice(0, 180),
    depTime: times[0] || "",
    arrTime: times[1] || "",
    durationMin: parseDurationMin(text),
    stops: parseStops(text),
  };
}

function pickBestCard(filters) {
  let best = null;
  for (const el of flightCards()) {
    const card = parseCard(el);
    if (!card.miles) continue;
    if (!matchesFilter(card, filters)) continue;
    if (!best || card.miles < best.miles) best = card;
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

function isSmilesSearch() {
  return /smiles\.com\.br/i.test(location.hostname || "") && /emissao-passagem|resultado/i.test(location.href || "");
}

function pageKind() {
  const t = (document.body?.innerText || "").slice(0, 9000);
  if (/acesso\s+negado|are\s+you\s+human|captcha/i.test(t)) return "BLOCKED";
  if (/n[aã]o\s+encontramos|nenhum\s+voo|sem\s+voo\s+dispon/i.test(t)) return "NO_RESULTS";
  if (/milhas/i.test(t) && /\d{1,2}:\d{2}/.test(t)) return "RESULTS";
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
  while (Date.now() - t0 < 45000) {
    const kind = pageKind();
    if (kind === "BLOCKED") return { miles: 0, error: "A Smiles bloqueou a página (captcha ou acesso)." };
    if (kind === "NO_RESULTS" && Date.now() - t0 > 12000) {
      return { miles: 0, error: "Smiles sem voos neste trecho/data." };
    }
    if (kind === "RESULTS") {
      sawResults = true;
      const best = pickBestCard(filters);
      if (best?.miles > 0) return best;
    }
    await sleep(400);
  }
  const last = pickBestCard(filters);
  if (last?.miles > 0) return last;
  return {
    miles: 0,
    error: sawResults
      ? hasActiveFilters(filters)
        ? "Nenhum voo bate com os filtros (horário, duração ou direto)."
        : "Resultados carregaram, mas não achei as milhas na Smiles."
      : "Não achei as milhas na Smiles.",
  };
}

async function run() {
  const t0 = Date.now();
  while (!isSmilesSearch() && Date.now() - t0 < 10000) await sleep(300);
  if (!isSmilesSearch()) {
    sendResult({ ok: false, airline: "Smiles", error: "Não abriu a busca da Smiles." });
    return;
  }
  const filters = await loadFilters();
  const price = await scrape(filters);
  sendResult({
    ok: price.miles > 0,
    miles: price.miles || 0,
    airline: "Smiles",
    rawPrice: price.raw || "",
    depTime: price.depTime || "",
    arrTime: price.arrTime || "",
    durationMin: price.durationMin || 0,
    stops: price.stops,
    error: price.miles > 0 ? "" : price.error || "Não achei as milhas na Smiles.",
  });
}
