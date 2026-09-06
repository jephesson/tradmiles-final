if (!globalThis.__tmAzulScript) {
globalThis.__tmAzulScript = true;

/* captura manual em content/capture-miles.js */

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
    /* 2544.38 */
  } else v = v.replace(/\./g, "");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
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

function dismissCookies() {
  document.querySelector("#onetrust-accept-btn-handler")?.click();
  for (const el of document.querySelectorAll("button, a")) {
    const t = (el.textContent || "").trim();
    if (/^(aceitar(\s+(todos|cookies))?|concordar)$/i.test(t)) el.click();
  }
}

function clickIf(re) {
  const el = [...document.querySelectorAll("button, a, span, div, li, [role='option']")].find((node) => {
    const t = (node.textContent || "").replace(/\s+/g, " ").trim();
    return t.length < 40 && re.test(t);
  });
  if (el) el.click();
  return Boolean(el);
}

async function sortMenorPreco() {
  const already = [...document.querySelectorAll("button, div, span, select")].some((el) =>
    /menor\s+pre[cç]o/i.test((el.textContent || "").replace(/\s+/g, " "))
  );
  if (already && /ordenado\s+por/i.test(document.body?.innerText || "")) {
    clickIf(/^menor\s+pre[cç]o$/i);
    return;
  }
  clickIf(/ordenado\s+por|ordenar\s+por/i);
  await sleep(250);
  clickIf(/^menor\s+pre[cç]o$/i);
}

async function showPontosOrReais() {
  if (isPts()) clickIf(/^pontos$/i);
  else clickIf(/^reais$/i);
}

function firstPrice() {
  const pts = isPts();
  const nodes = [...document.querySelectorAll("div, span, p, button, strong")];
  for (const el of nodes) {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t.length > 50) continue;
    if (pts) {
      const miles = parseMiles(t);
      if (miles) return { cents: 0, miles, raw: t };
    } else if (/a\s+partir\s+de/i.test(t)) {
      const cents = moneyToCents(t);
      if (cents > 0) return { cents, miles: 0, raw: t };
    }
  }
  return null;
}

function isAzulSearch() {
  return /voeazul\.com\.br/i.test(location.hostname || "") && /selecao-voo/i.test(location.pathname || "");
}

function pageKind() {
  const t = (document.body?.innerText || "").slice(0, 8000);
  if (/acesso\s+negado|are\s+you\s+human|captcha/i.test(t)) return "BLOCKED";
  if (/n[aã]o\s+encontramos\s+voo|nenhum\s+voo\s+dispon|sem\s+voo\s+dispon/i.test(t)) return "NO_RESULTS";
  if (/a\s+partir\s+de/i.test(t) && (isPts() ? /(pontos|pts|milhas)/i.test(t) : /R\$/.test(t))) return "RESULTS";
  return "WAIT";
}

function sendResult(payload) {
  chrome.runtime.sendMessage({ type: "TM_COTACAO_RESULT", ...payload }, () => {
    void chrome.runtime.lastError;
  });
}

async function scrape() {
  dismissCookies();
  await showPontosOrReais();
  await sortMenorPreco();

  const t0 = Date.now();
  let saw = false;
  let sorted = false;
  while (Date.now() - t0 < 20000) {
    const kind = pageKind();
    if (kind === "BLOCKED") return { cents: 0, miles: 0, error: "A Azul bloqueou a página (captcha ou acesso)." };
    if (kind === "NO_RESULTS" && Date.now() - t0 > 8000) {
      return { cents: 0, miles: 0, error: "Azul sem voos neste trecho/data." };
    }
    if (kind === "RESULTS") {
      saw = true;
      if (!sorted) {
        await sortMenorPreco();
        sorted = true;
        await sleep(400);
      }
      const best = firstPrice();
      if (best?.cents > 0 || best?.miles > 0) return best;
    }
    await sleep(250);
  }
  const last = firstPrice();
  if (last?.cents > 0 || last?.miles > 0) return last;
  return {
    cents: 0,
    miles: 0,
    error: saw ? "A lista da Azul carregou, mas não achei o valor." : "Não achei o preço na Azul.",
  };
}

async function run() {
  const t0 = Date.now();
  while (!isAzulSearch() && Date.now() - t0 < 10000) await sleep(300);
  if (!isAzulSearch()) {
    sendResult({ ok: false, airline: "AZUL", error: "Não abriu a busca da Azul." });
    return;
  }
  const pts = isPts();
  const price = await scrape();
  const ok = pts ? price.miles > 0 : price.cents > 0;
  sendResult({
    ok,
    priceCents: price.cents || 0,
    miles: price.miles || 0,
    airline: pts ? "Azul milhas" : "AZUL",
    rawPrice: price.raw || "",
    error: ok ? "" : price.error || (pts ? "Não achei as milhas na Azul." : "Não achei o preço na Azul."),
  });
}
}
