function moneyToCents(s) {
  const m = String(s || "").match(/R\$\s*[\d.,]+/);
  if (!m) return 0;
  const v = m[0].replace("R$", "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function airlineFromText(text) {
  const t = String(text || "").toUpperCase();
  const m = t.match(/\bVOO\s+([A-Z0-9]{2})\s*[- ]?\s*\d+\b/);
  const code = m?.[1] || "";
  if (code === "G3") return "GOL";
  if (code === "AD") return "AZUL";
  if (code === "LA" || code === "JJ") return "LATAM";
  if (t.includes("GOL")) return "GOL";
  if (t.includes("AZUL")) return "AZUL";
  if (t.includes("LATAM")) return "LATAM";
  return "";
}

function extractPrice() {
  const labels = Array.from(document.querySelectorAll("span, div, p")).filter((el) =>
    /total\s+no\s+pix/i.test(el.textContent || "")
  );
  for (const el of labels) {
    const row = el.closest("div, section, article, li") || el.parentElement;
    const cents = moneyToCents(row?.innerText || el.parentElement?.innerText || "");
    if (cents > 0) return { cents, raw: row?.innerText || "" };
  }
  const pix = Array.from(document.querySelectorAll("span, div")).filter((el) =>
    /\bno\s+pix\b/i.test(el.textContent || "")
  );
  let best = 0;
  let raw = "";
  for (const el of pix.slice(0, 25)) {
    const txt = (el.parentElement?.innerText || el.innerText || "");
    const cents = moneyToCents(txt);
    if (cents > 0 && (!best || cents < best)) {
      best = cents;
      raw = txt;
    }
  }
  return { cents: best, raw };
}

function extractAirline() {
  const nodes = document.querySelectorAll("span.flight-time__flight-number, [class*='flight-number']");
  for (const n of nodes) {
    const cia = airlineFromText(n.textContent || n.parentElement?.innerText || "");
    if (cia) return cia;
  }
  return airlineFromText(document.body?.innerText || "");
}

async function run() {
  if (!/\/v2\/busca/.test(location.href)) return;
  await new Promise((r) => setTimeout(r, 4500));
  const price = extractPrice();
  const airline = extractAirline();
  chrome.runtime.sendMessage({
    type: "TM_COTACAO_RESULT",
    ok: price.cents > 0,
    priceCents: price.cents,
    airline,
    rawPrice: price.raw,
    error: price.cents > 0 ? "" : "Não achei o preço no 123milhas.",
  });
}

run();
