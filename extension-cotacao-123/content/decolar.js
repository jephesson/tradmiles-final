if (!globalThis.__tmDecolarScript) {
globalThis.__tmDecolarScript = true;

function pageKey(kind) {
  return `tmdecolar:${kind}:${location.pathname}${location.search}`;
}

function boot() {
  if (sessionStorage.getItem(pageKey("sent"))) return;
  if (/[?&]tm=1(?:&|$)/.test(location.search || "")) {
    if (sessionStorage.getItem(pageKey("run"))) return;
    sessionStorage.setItem(pageKey("run"), "1");
    run();
    return;
  }
  waitAndRun(run);
}

globalThis.__tmDecolarBoot = boot;
boot();

function alive() {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function waitAndRun(fn) {
  const t0 = Date.now();
  const tick = () => {
    if (sessionStorage.getItem(pageKey("sent")) || sessionStorage.getItem(pageKey("run"))) return;
    if (!alive()) return;
    try {
      chrome.runtime.sendMessage({ type: "TM_COTACAO_SHOULD_SCRAPE" }, (res) => {
        try {
          if (!alive()) return;
          if (res?.ok) {
            if (sessionStorage.getItem(pageKey("run"))) return;
            sessionStorage.setItem(pageKey("run"), "1");
            fn();
            return;
          }
          if (Date.now() - t0 < 25000) setTimeout(tick, 120);
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* extensão recarregada */
    }
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

function pack(card, cents) {
  const carrier = carrierFromText((card.textContent || "").slice(0, 2500));
  return {
    cents,
    carrier,
    raw: carrier ? `${carrier} · R$ ${(cents / 100).toLocaleString("pt-BR")}` : `R$ ${(cents / 100).toLocaleString("pt-BR")}`,
  };
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
  return pickByPrecoFinal();
}

function sendResult(payload) {
  if (sessionStorage.getItem(pageKey("sent"))) return;
  sessionStorage.setItem(pageKey("sent"), "1");
  if (!alive()) return;
  try {
    chrome.runtime.sendMessage({ type: "TM_COTACAO_RESULT", ...payload }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    /* ignore */
  }
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
  const poll = setInterval(() => {
    if (sessionStorage.getItem(pageKey("sent"))) {
      clearInterval(poll);
      return;
    }
    const next = pickFirstFlight();
    if (next) {
      clearInterval(poll);
      finish(next);
    }
  }, 150);
  setTimeout(() => {
    if (sessionStorage.getItem(pageKey("sent"))) return;
    clearInterval(poll);
    const last = pickFirstFlight();
    if (last) finish(last);
    else finish({ cents: 0, error: "Não achei o primeiro voo no Decolar." });
  }, 18000);
}

} else {
  globalThis.__tmDecolarBoot?.();
}
