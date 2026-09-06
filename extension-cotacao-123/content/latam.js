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

function brlToCents(s) {
  const t = String(s || "");
  const m = t.match(/(?:R\$|BRL)?\s*(\d{1,3}(?:\.\d{3})*|\d+),\d{2}/i);
  if (!m) return 0;
  const n = Number(m[0].replace(/R\$|BRL/i, "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function parseMiles(s) {
  const t = String(s || "").replace(/\s+/g, " ");
  const m = t.match(/(\d{1,3}(?:\.\d{3})+|\d{3,7})\s*(milhas|pts|pontos)/i);
  if (!m) return 0;
  const n = Number(m[1].replace(/\./g, ""));
  return Number.isFinite(n) && n >= 500 ? n : 0;
}

function isRedemption() {
  return /[?&]redemption=true/i.test(location.search || "");
}

function searchDay() {
  const m = (location.search || "").match(/outbound=(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function isSelected(el) {
  if (/true/i.test(el.getAttribute("aria-selected") || el.getAttribute("aria-current") || "")) return true;
  const cls = `${el.className || ""} ${el.parentElement?.className || ""}`;
  return /selected|active|current|checked/i.test(cls);
}

function barItems() {
  const out = [];
  for (const el of document.querySelectorAll("button, [role='tab'], [role='button'], a, li, div")) {
    const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length > 60 || t.length < 6) continue;
    const date = t.match(/(\d{1,2})\/(\d{1,2})/);
    const cents = brlToCents(t);
    if (!date || cents < 5000) continue;
    if (/milhas/i.test(t)) continue;
    out.push({
      el,
      t,
      cents,
      d: Number(date[1]),
      m: Number(date[2]),
      selected: isSelected(el),
      raw: (t.match(/(?:R\$|BRL)?\s*[\d.]+,\d{2}/i) || [t])[0],
    });
  }
  const seen = new Set();
  return out.filter((r) => {
    const k = `${r.d}|${r.m}|${r.cents}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function pickFromBar() {
  const rows = barItems();
  if (!rows.length) return null;
  const selected = rows.find((r) => r.selected);
  if (selected) return selected;
  const day = searchDay();
  if (day) {
    const hit = rows.find((r) => r.d === day.d && r.m === day.m);
    if (hit) return hit;
  }
  return rows.sort((a, b) => a.cents - b.cents)[0];
}

function pickMiles() {
  let best = 0;
  let raw = "";
  for (const el of document.querySelectorAll("div, span, p, strong, button")) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length > 40) continue;
    const n = parseMiles(t);
    if (!n) continue;
    if (!best || n < best) {
      best = n;
      raw = t;
    }
  }
  return best ? { miles: best, raw } : null;
}

function dismissCookies() {
  document.querySelector("#onetrust-accept-btn-handler")?.click();
  for (const el of document.querySelectorAll("button, a")) {
    const t = (el.textContent || "").trim();
    if (/^(aceitar(\s+(todos|cookies))?|concordar)$/i.test(t)) el.click();
  }
}

function isLatamSearch() {
  return /latamairlines\.com/i.test(location.hostname || "") && /oferta-voos/i.test(location.pathname || "");
}

function pageKind() {
  const t = (document.body?.innerText || "").slice(0, 8000);
  if (/acesso\s+negado|are\s+you\s+human|captcha/i.test(t)) return "BLOCKED";
  if (/n[aã]o\s+encontramos\s+voo|nenhum\s+voo|sem\s+voo\s+dispon/i.test(t)) return "NO_RESULTS";
  if (isRedemption() && /milhas/i.test(t)) return "RESULTS";
  if (barItems().length > 0) return "RESULTS";
  if (/\d{1,2}\/\d{2}/.test(t) && /\d+,\d{2}/.test(t)) return "RESULTS";
  return "WAIT";
}

function sendResult(payload) {
  chrome.runtime.sendMessage({ type: "TM_COTACAO_RESULT", ...payload }, () => {
    void chrome.runtime.lastError;
  });
}

async function scrape() {
  dismissCookies();
  const redemption = isRedemption();
  const t0 = Date.now();
  let saw = false;
  while (Date.now() - t0 < 20000) {
    const kind = pageKind();
    if (kind === "BLOCKED") return { cents: 0, miles: 0, error: "A LATAM bloqueou a página (captcha ou acesso)." };
    if (kind === "NO_RESULTS" && Date.now() - t0 > 8000) {
      return { cents: 0, miles: 0, error: "LATAM sem voos neste trecho/data." };
    }
    if (kind === "RESULTS") {
      saw = true;
      if (redemption) {
        const miles = pickMiles();
        if (miles?.miles > 0) return { cents: 0, ...miles };
      } else {
        const bar = pickFromBar();
        if (bar?.cents > 0) return { cents: bar.cents, miles: 0, raw: bar.raw };
      }
    }
    await sleep(250);
  }
  if (redemption) {
    const miles = pickMiles();
    if (miles?.miles > 0) return { cents: 0, ...miles };
  } else {
    const bar = pickFromBar();
    if (bar?.cents > 0) return { cents: bar.cents, miles: 0, raw: bar.raw };
  }
  return {
    cents: 0,
    miles: 0,
    error: saw ? "A página carregou, mas não achei o valor na LATAM." : "Não achei o preço na LATAM.",
  };
}

async function run() {
  const t0 = Date.now();
  while (!isLatamSearch() && Date.now() - t0 < 10000) await sleep(300);
  if (!isLatamSearch()) {
    sendResult({ ok: false, airline: "LATAM", error: "Não abriu a busca da LATAM." });
    return;
  }
  const redemption = isRedemption();
  const price = await scrape();
  const ok = redemption ? price.miles > 0 : price.cents > 0;
  sendResult({
    ok,
    priceCents: price.cents || 0,
    miles: price.miles || 0,
    airline: redemption ? "LATAM milhas" : "LATAM",
    rawPrice: price.raw || "",
    error: ok ? "" : price.error || (redemption ? "Não achei as milhas na LATAM." : "Não achei o preço na LATAM."),
  });
}
