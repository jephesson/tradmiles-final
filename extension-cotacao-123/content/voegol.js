if (!globalThis.__tmGolScript) {
globalThis.__tmGolScript = true;

const runKey = `tmgol:${location.href}`;
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
  const m = String(s || "").match(/R\$\s*[\d.]+,\d{2}|R\$\s*\d+\.\d{2}|R\$\s*[\d.,]+/);
  if (!m) return 0;
  let v = m[0].replace("R$", "").trim();
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d+\.\d{2}$/.test(v)) {
    /* 712.80 */
  } else v = v.replace(/\./g, "");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function searchDay() {
  const q = location.search || "";
  const br = q.match(/[?&]ida=(\d{1,2})-(\d{1,2})-(\d{4})/i);
  if (br) return { d: Number(br[1]), m: Number(br[2]) };
  return null;
}

function monthNum(raw) {
  const t = String(raw || "").toLowerCase();
  const map = {
    jan: 1,
    fev: 2,
    mar: 3,
    abr: 4,
    mai: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    set: 9,
    out: 10,
    nov: 11,
    dez: 12,
  };
  for (const [k, v] of Object.entries(map)) {
    if (t.includes(k)) return v;
  }
  return 0;
}

function isSelected(el) {
  const aria = `${el.getAttribute("aria-selected") || ""} ${el.getAttribute("aria-pressed") || ""}`;
  if (/^true$/i.test(aria.trim())) return true;
  const cls = `${el.className || ""} ${el.parentElement?.className || ""}`;
  if (/selected|active|atual|current/i.test(cls)) return true;
  const st = window.getComputedStyle(el);
  if (/rgb\(255,\s*(1[0-2]\d|9\d)/.test(st.borderColor) || /rgb\(255,\s*(1[0-2]\d|9\d)/.test(st.outlineColor)) {
    return true;
  }
  return false;
}

function barItems() {
  const out = [];
  for (const el of document.querySelectorAll("button, [role='button'], [role='tab'], li, div")) {
    const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length > 70 || t.length < 10) continue;
    if (!/a\s+partir\s+de/i.test(t)) continue;
    const cents = moneyToCents(t);
    if (cents < 5000) continue;
    const dm = t.match(/(\d{1,2})\s*([a-zç]{3})/i);
    out.push({
      el,
      t,
      cents,
      d: dm ? Number(dm[1]) : 0,
      m: dm ? monthNum(dm[2]) : 0,
      selected: isSelected(el),
      raw: (t.match(/a\s+partir\s+de\s+R\$\s*[\d.,]+/i) || [t])[0],
    });
  }
  const unique = [];
  const seen = new Set();
  for (const row of out) {
    const k = `${row.d}|${row.m}|${row.cents}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(row);
  }
  return unique;
}

function pickFromBar() {
  const rows = barItems();
  if (!rows.length) return null;
  const day = searchDay();
  const selected = rows.find((r) => r.selected);
  if (selected) return selected;
  if (day) {
    const hit = rows.find((r) => r.d === day.d && (!r.m || r.m === day.m));
    if (hit) return hit;
  }
  return rows.sort((a, b) => a.cents - b.cents)[0];
}

function dismissCookies() {
  document.querySelector("#onetrust-accept-btn-handler")?.click();
  document.querySelector("#ensAcceptAll")?.click();
  for (const el of document.querySelectorAll("button, a")) {
    const t = (el.textContent || "").trim();
    if (/^(aceitar(\s+(todos|cookies))?|concordar|ok,\s*entendi)$/i.test(t)) el.click();
  }
}

function isGolSearch() {
  const host = location.hostname || "";
  if (!/voegol\.com\.br$/i.test(host)) return false;
  const path = location.pathname || "";
  return /busca-parceiros|selecao-de-voo|compra\//i.test(path) || /[?&]de=/.test(location.search || "");
}

function pageKind() {
  const t = (document.body?.innerText || "").slice(0, 8000);
  if (/acesso\s+negado|are\s+you\s+human|captcha|verifique\s+que\s+voc[eê]\s+n[aã]o\s+[eé]\s+um\s+rob[oô]/i.test(t)) {
    return "BLOCKED";
  }
  if (/nenhum\s+voo\s+dispon|n[aã]o\s+encontramos\s+voo|sem\s+voo\s+dispon/i.test(t)) return "NO_RESULTS";
  if (/a\s+partir\s+de\s+R\$/i.test(t)) return "RESULTS";
  return "WAIT";
}

function sendResult(payload) {
  chrome.runtime.sendMessage({ type: "TM_COTACAO_RESULT", ...payload }, () => {
    void chrome.runtime.lastError;
  });
}

async function scrape() {
  dismissCookies();
  const t0 = Date.now();
  let saw = false;
  while (Date.now() - t0 < 18000) {
    const kind = pageKind();
    if (kind === "BLOCKED") return { cents: 0, error: "A GOL bloqueou a página (captcha ou acesso)." };
    if (kind === "NO_RESULTS" && Date.now() - t0 > 7000) {
      return { cents: 0, error: "GOL sem voos neste trecho/data." };
    }
    if (kind === "RESULTS") {
      saw = true;
      const best = pickFromBar();
      if (best?.cents > 0) return best;
    }
    await sleep(250);
  }
  const last = pickFromBar();
  if (last?.cents > 0) return last;
  return { cents: 0, error: saw ? "A barrinha da GOL apareceu, mas não achei o preço." : "Não achei o preço na GOL." };
}

async function run() {
  const t0 = Date.now();
  while (!isGolSearch() && Date.now() - t0 < 8000) await sleep(250);
  if (!isGolSearch()) {
    sendResult({ ok: false, airline: "GOL", error: "Não abriu a busca da GOL." });
    return;
  }
  const price = await scrape();
  sendResult({
    ok: price.cents > 0,
    priceCents: price.cents || 0,
    airline: "GOL",
    rawPrice: price.raw || "",
    error: price.cents > 0 ? "" : price.error || "Não achei o preço na GOL.",
  });
}
}
