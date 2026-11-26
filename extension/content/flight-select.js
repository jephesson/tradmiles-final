/**
 * Resultados da LATAM (oferta-voos): abre sozinho o voo que o cliente mandou no Telegram.
 * O horário vem do link (#tm-voo=ida:14:15-16:45;volta:...) ou da sessão de preenchimento do TradeMiles.
 * Só abre o card (mostra as tarifas) e destaca; a tarifa quem escolhe é o emissor.
 */
(() => {
  if (globalThis.__tmFlightSelect) return;
  globalThis.__tmFlightSelect = true;

  const STORE = `tm-voo:${location.search}`;
  const DONE = `tm-voo-ok:${location.search}`;

  /** "06:05" → "6:05" (a LATAM mostra sem o zero). */
  function clock(t) {
    const m = String(t || "").match(/(\d{1,2}):(\d{2})/);
    return m ? `${Number(m[1])}:${m[2]}` : "";
  }

  function parseTarget(raw) {
    const out = {};
    for (const part of String(raw || "").split(";")) {
      const m = part.match(/^(ida|volta):(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/i);
      if (m) out[m[1].toLowerCase()] = { dep: clock(m[2]), arr: clock(m[3]) };
    }
    return out.ida || out.volta ? out : null;
  }

  function fromHash() {
    const m = decodeURIComponent(location.hash || "").match(/tm-voo=([^&]+)/);
    const t = m ? parseTarget(m[1]) : null;
    if (t) {
      try {
        sessionStorage.setItem(STORE, JSON.stringify(t));
      } catch {
        /* ignore */
      }
      return t;
    }
    try {
      return JSON.parse(sessionStorage.getItem(STORE) || "null");
    } catch {
      return null;
    }
  }

  /** Sessão do TradeMiles, só se for desta busca (mesmo trecho e data). */
  function fromSession() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "TM_GET_FILL_PAYLOAD" }, (res) => {
          void chrome.runtime.lastError;
          const ctx = res?.ok ? res.data?.context : null;
          if (!ctx) return resolve(null);
          const q = new URLSearchParams(location.search);
          const sameRoute =
            String(q.get("origin") || "").toUpperCase() === String(ctx.origin || "").toUpperCase() &&
            String(q.get("destination") || "").toUpperCase() === String(ctx.destination || "").toUpperCase() &&
            String(q.get("outbound") || "").slice(0, 10) === String(ctx.outbound || "").slice(0, 10);
          if (!sameRoute) return resolve(null);
          const t = {};
          if (ctx.outboundDep && ctx.outboundArr) t.ida = { dep: clock(ctx.outboundDep), arr: clock(ctx.outboundArr) };
          if (ctx.inboundDep && ctx.inboundArr) t.volta = { dep: clock(ctx.inboundDep), arr: clock(ctx.inboundArr) };
          resolve(t.ida || t.volta ? t : null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  /** Lista de ida ou de volta? (cabeçalho "Escolha um voo de volta"). */
  function direction() {
    const head = [...document.querySelectorAll("h1, h2, h3")].map((h) => h.textContent || "").join(" ");
    return /voo de volta/i.test(head) ? "volta" : "ida";
  }

  function cards() {
    return [...document.querySelectorAll('[data-testid^="wrapper-card-header-"]')].map((el) => {
      const t = `${el.getAttribute("aria-label") || ""} ${el.innerText || ""}`.replace(/\s+/g, " ");
      const dep = clock((t.match(/sa[ií]da\s+(\d{1,2}:\d{2})/i) || [])[1]);
      const arr = clock((t.match(/chegada\s+(\d{1,2}:\d{2})/i) || [])[1]);
      // Sem o texto de acessibilidade: os dois primeiros horários do card.
      const clocks = (el.innerText || "").match(/\b\d{1,2}:\d{2}\b/g) || [];
      return { el, dep: dep || clock(clocks[0]), arr: arr || clock(clocks[1]) };
    });
  }

  function toast(msg, ok) {
    let box = document.getElementById("tm-voo-toast");
    if (!box) {
      box = document.createElement("div");
      box.id = "tm-voo-toast";
      box.style.cssText =
        "position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);padding:10px 16px;border-radius:12px;font:600 14px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2)";
      document.body.appendChild(box);
    }
    box.style.background = ok ? "#059669" : "#b45309";
    box.style.color = "#fff";
    box.textContent = msg;
    clearTimeout(box._t);
    box._t = setTimeout(() => box.remove(), 7000);
  }

  function highlight(el) {
    const card = el.closest("li") || el;
    card.style.outline = "3px solid #059669";
    card.style.outlineOffset = "4px";
    card.style.borderRadius = "12px";
  }

  let target = null;
  const tried = { ida: false, volta: false };
  const t0 = Date.now();

  async function tick() {
    if (Date.now() - t0 > 120000) return;
    if (!target) target = fromHash() || (await fromSession());
    if (!target) return setTimeout(tick, 1500);

    const dir = direction();
    const want = target[dir];
    const doneKey = `${DONE}:${dir}`;
    if (!want || sessionStorage.getItem(doneKey)) return setTimeout(tick, 1000);

    const list = cards();
    if (!list.length) return setTimeout(tick, 700);

    const hit = list.find((c) => c.dep === want.dep && c.arr === want.arr);
    if (hit) {
      sessionStorage.setItem(doneKey, "1");
      hit.el.scrollIntoView({ block: "center" });
      if (hit.el.getAttribute("aria-expanded") !== "true") hit.el.click();
      highlight(hit.el);
      toast(`✓ Voo do cliente aberto: ${want.dep} → ${want.arr}. Escolha a tarifa.`, true);
    } else if (!tried[dir]) {
      // A lista pode ainda estar carregando: espera um pouco antes de avisar.
      tried[dir] = Date.now();
    } else if (Date.now() - tried[dir] > 6000) {
      sessionStorage.setItem(doneKey, "1");
      toast(`Não achei o voo ${want.dep} → ${want.arr} nesta lista. Confira a data ou escolha à mão.`, false);
    }
    setTimeout(tick, 900);
  }

  setTimeout(tick, 800);
})();
