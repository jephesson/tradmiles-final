if (!globalThis.__tmDecolarScript) {
globalThis.__tmDecolarScript = true;

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
      if (Date.now() - t0 < 1500) setTimeout(tick, 80);
    });
  };
  tick();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const MIN_FARE_CENTS = 5000;

function digitsToCents(raw) {
  const t = String(raw || "").replace(/\s+/g, "").replace(/R\$|BRL/gi, "");
  if (!t) return 0;
  let v = t;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/\./g, "");
  const n = Number(v);
  if (!Number.isFinite(n) || n < MIN_FARE_CENTS / 100) return 0;
  return Math.round(n * 100);
}

function parseClock(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseDurationMin(text) {
  const t = String(text || "");
  const hm = t.match(/(\d+)\s*h(?:oras?)?\s*(?:e\s*)?(\d+)\s*m(?:in)?/i);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const compact = t.match(/(\d+)\s*h\s*(\d{2})\b/i);
  if (compact) return Number(compact[1]) * 60 + Number(compact[2]);
  return 0;
}

function parseStops(text) {
  const t = String(text || "");
  if (/direto|sem\s+parada|sem\s+escala/i.test(t)) return 0;
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

function amountEls() {
  return document.querySelectorAll("span.amount.price-amount, .amount.price-amount, span.price-amount");
}

function firstAmountHit() {
  for (const el of amountEls()) {
    const cents = digitsToCents(el.textContent || "");
    if (cents >= MIN_FARE_CENTS) return { el, cents };
  }
  return null;
}

function enrichFromParent(el, cents) {
  let node = el;
  let text = "";
  for (let i = 0; i < 12 && node; i++) {
    const t = node.innerText || "";
    if (t.length > 80 && t.length < 4000) {
      text = t;
      break;
    }
    node = node.parentElement;
  }
  const times = [...text.matchAll(/\b(\d{1,2}:\d{2})\b/g)].map((m) => parseClock(m[1])).filter(Boolean);
  return {
    cents,
    raw: `R$ ${(cents / 100).toLocaleString("pt-BR")}`,
    depTime: times[0] || "",
    arrTime: times[1] || "",
    durationMin: parseDurationMin(text),
    stops: parseStops(text),
    carrier: carrierFromText(text),
  };
}

function pickFirstPrice() {
  const hit = firstAmountHit();
  if (!hit) return null;
  return enrichFromParent(hit.el, hit.cents);
}

function dismissCookies() {
  document.querySelector("#onetrust-accept-btn-handler")?.click();
}

function isDecolarSearch() {
  return /decolar\.com/i.test(location.hostname || "") && /\/flights\/results/i.test(location.pathname || "");
}

function sendResult(payload) {
  chrome.runtime.sendMessage({ type: "TM_COTACAO_RESULT", ...payload }, () => {
    void chrome.runtime.lastError;
  });
}

async function scrape() {
  dismissCookies();
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    const first = pickFirstPrice();
    if (first?.cents >= MIN_FARE_CENTS) return first;
    await sleep(150);
  }
  const last = pickFirstPrice();
  if (last?.cents >= MIN_FARE_CENTS) return last;
  return { cents: 0, error: "Não achei o preço no Decolar." };
}

async function run() {
  const t0 = Date.now();
  while (!isDecolarSearch() && Date.now() - t0 < 8000) await sleep(150);
  if (!isDecolarSearch()) {
    sendResult({ ok: false, airline: "Decolar", error: "Não abriu a busca do Decolar." });
    return;
  }
  const price = await scrape();
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
}
