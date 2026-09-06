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
  if (/\bLATAM\b|\bLA\b|\bJJ\b/.test(t)) return "LATAM";
  return "";
}

function firstBuyButton() {
  const buttons = document.getElementsByTagName("button");
  const limit = Math.min(buttons.length, 60);
  for (let i = 0; i < limit; i++) {
    const t = (buttons[i].textContent || "").replace(/\s+/g, " ").trim();
    if (/^comprar$/i.test(t)) return buttons[i];
  }
  return null;
}

function cardFromBuy(btn) {
  let el = btn;
  for (let i = 0; i < 10 && el; i++) {
    const t = el.textContent || "";
    if (t.length > 80 && t.length < 3500 && /pre[cç]o\s+final/i.test(t)) return el;
    el = el.parentElement;
  }
  return btn.parentElement;
}

function finalPriceInCard(card) {
  const amounts = card.querySelectorAll("span.amount.price-amount, .amount.price-amount");
  for (let i = amounts.length - 1; i >= 0; i--) {
    const el = amounts[i];
    let node = el;
    for (let u = 0; u < 4 && node && node !== card; u++) {
      const t = (node.textContent || "").slice(0, 180);
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
  const m = (card.textContent || "").match(/pre[cç]o\s+final[^0-9]{0,40}(\d{1,3}(?:\.\d{3})+|\d{2,6})/i);
  return m ? digitsToCents(m[1]) : 0;
}

function pickFirstFlight() {
  const buy = firstBuyButton();
  if (!buy) return null;
  const card = cardFromBuy(buy);
  if (!card) return null;
  const cents = finalPriceInCard(card);
  if (cents < MIN_FARE_CENTS) return null;
  const text = (card.textContent || "").slice(0, 2000);
  const carrier = carrierFromText(text);
  return {
    cents,
    carrier,
    raw: carrier ? `${carrier} · R$ ${(cents / 100).toLocaleString("pt-BR")}` : `R$ ${(cents / 100).toLocaleString("pt-BR")}`,
  };
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
    if (Date.now() - t0 > 8000) {
      clearInterval(poll);
      finish({ cents: 0, error: "Não achei o primeiro voo no Decolar." });
    }
  }, 100);
}
