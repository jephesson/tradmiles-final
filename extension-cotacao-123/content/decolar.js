if (!globalThis.__tmDecolarScript) {
  globalThis.__tmDecolarScript = true;
  globalThis.__tmDecolarBoot = boot;
  boot();
} else {
  globalThis.__tmDecolarBoot?.();
}

function boot() {
  if (sessionStorage.getItem("tmdecolar:sent")) return;
  waitAndRun(run);
}

function waitAndRun(fn) {
  const t0 = Date.now();
  const tick = () => {
    if (sessionStorage.getItem("tmdecolar:sent") || sessionStorage.getItem("tmdecolar:run")) return;
    chrome.runtime.sendMessage({ type: "TM_COTACAO_SHOULD_SCRAPE" }, (res) => {
      if (res?.ok) {
        if (sessionStorage.getItem("tmdecolar:run")) return;
        sessionStorage.setItem("tmdecolar:run", "1");
        fn();
        return;
      }
      if (Date.now() - t0 < 20000) setTimeout(tick, 80);
    });
  };
  tick();
}

const MIN_FARE_CENTS = 5000;

function digitsToCents(raw) {
  const t = String(raw || "").replace(/\s+/g, "").replace(/R\$|BRL/gi, "");
  if (!t || t.length > 12) return 0;
  let v = t;
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/\./g, "");
  const n = Number(v);
  if (!Number.isFinite(n) || n < MIN_FARE_CENTS / 100) return 0;
  return Math.round(n * 100);
}

function carrierFromText(text) {
  const t = String(text || "").toUpperCase();
  if (/\bGOL\b|\bG3\b|VOEGOL/.test(t)) return "GOL";
  if (/\bAZUL\b/.test(t)) return "AZUL";
  if (/\bLATAM\b/.test(t)) return "LATAM";
  return "";
}

function isComprar(el) {
  const t = (el.textContent || "").replace(/\s+/g, " ").trim();
  return t.length <= 24 && /comprar/i.test(t);
}

function firstBuy() {
  const nodes = document.querySelectorAll("a, button, [role='button']");
  const limit = Math.min(nodes.length, 250);
  for (let i = 0; i < limit; i++) {
    if (isComprar(nodes[i])) return nodes[i];
  }
  return null;
}

function cardFromBuy(btn) {
  let el = btn;
  let found = null;
  for (let i = 0; i < 14 && el; i++) {
    const t = el.textContent || "";
    if (t.length > 60 && t.length < 12000 && /pre[cç]o\s+final/i.test(t)) found = el;
    el = el.parentElement;
  }
  return found || btn.parentElement;
}

function pack(card, cents) {
  const carrier = carrierFromText((card.textContent || "").slice(0, 2500));
  return {
    cents,
    carrier,
    raw: carrier ? `${carrier} · R$ ${(cents / 100).toLocaleString("pt-BR")}` : `R$ ${(cents / 100).toLocaleString("pt-BR")}`,
  };
}

function finalPriceInCard(card) {
  const amounts = card.querySelectorAll("span.amount.price-amount, .amount.price-amount, span.price-amount");
  for (let i = amounts.length - 1; i >= 0; i--) {
    const el = amounts[i];
    let node = el;
    for (let u = 0; u < 5 && node && node !== card; u++) {
      const t = (node.textContent || "").slice(0, 220);
      if (/pre[cç]o\s+final/i.test(t)) {
        const cents = digitsToCents(el.textContent || "");
        if (cents) return cents;
      }
      node = node.parentElement;
    }
  }
  if (amounts.length) {
    const last = digitsToCents(amounts[amounts.length - 1].textContent || "");
    if (last) return last;
  }
  const m = (card.textContent || "").match(/pre[cç]o\s+final[^0-9]{0,48}(\d{1,3}(?:\.\d{3})+|\d{2,6})/i);
  return m ? digitsToCents(m[1]) : 0;
}

function pickByPrecoFinal() {
  const amounts = document.getElementsByClassName("price-amount");
  const limit = Math.min(amounts.length, 40);
  for (let i = 0; i < limit; i++) {
    const el = amounts[i];
    let node = el;
    for (let u = 0; u < 6 && node; u++) {
      const t = (node.textContent || "").slice(0, 280);
      if (/pre[cç]o\s+final/i.test(t)) {
        const cents = digitsToCents(el.textContent || "");
        if (cents) return pack(node, cents);
      }
      node = node.parentElement;
    }
  }
  return null;
}

function pickFirstFlight() {
  const buy = firstBuy();
  if (buy) {
    const card = cardFromBuy(buy);
    if (card) {
      const cents = finalPriceInCard(card);
      if (cents >= MIN_FARE_CENTS) return pack(card, cents);
    }
  }
  return pickByPrecoFinal();
}

function sendResult(payload) {
  if (sessionStorage.getItem("tmdecolar:sent")) return;
  sessionStorage.setItem("tmdecolar:sent", "1");
  chrome.runtime.sendMessage({ type: "TM_COTACAO_RESULT", ...payload }, () => {
    void chrome.runtime.lastError;
  });
}

function finish(price) {
  sendResult({
    ok: price.cents > 0,
    priceCents: price.cents || 0,
    airline: "Decolar",
    carrier: price.carrier || "",
    rawPrice: price.raw || "",
    error: price.cents > 0 ? "" : price.error || "Não achei o preço no Decolar.",
  });
}

function run() {
  document.querySelector("#onetrust-accept-btn-handler")?.click();
  const first = pickFirstFlight();
  if (first) {
    finish(first);
    return;
  }
  const t0 = Date.now();
  const poll = setInterval(() => {
    if (sessionStorage.getItem("tmdecolar:sent")) {
      clearInterval(poll);
      return;
    }
    const next = pickFirstFlight();
    if (next) {
      clearInterval(poll);
      finish(next);
      return;
    }
    if (Date.now() - t0 > 12000) {
      clearInterval(poll);
      finish({ cents: 0, error: "Não achei o primeiro voo no Decolar." });
    }
  }, 120);
}
