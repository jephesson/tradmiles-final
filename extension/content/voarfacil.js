/* TradeMiles · Voar Fácil (emissao-externa.voarfacil.net)
 * 1) Lê o pedido (voos + passageiros) e envia ao TradeMiles.
 * 2) Preenche o formulário "Emitido" com os dados da venda. NÃO clica em Enviar.
 */
(function () {
  if (window.__tmVoarFacil) return;
  window.__tmVoarFacil = true;

  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const iata = (s) => (String(s || "").match(/\b([A-Z]{3})\b(?!.*\b[A-Z]{3}\b)/) || [])[1] || "";
  const brToIso = (s) => {
    const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  };
  const intBr = (s) => Number(String(s || "").replace(/\D/g, "")) || 0;
  const moneyCents = (s) => {
    const m = String(s || "").replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(m);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  function readOrder() {
    const code = (location.pathname.match(/[0-9a-f]{32}/i) || [])[0] || "";
    const h1 = clean(document.querySelector("h1")?.innerText);
    const pedido = (h1.match(/Pedido\s+(\d+)/i) || [])[1] || "";
    const dl = {};
    document.querySelectorAll("dt").forEach((dt) => {
      dl[clean(dt.innerText).toLowerCase()] = clean(dt.nextElementSibling?.innerText);
    });

    const legs = [];
    const passengers = [];
    document.querySelectorAll("table.flight-table:not(.form-table)").forEach((t) => {
      const rows = [...t.rows].map((r) => [...r.cells].map((c) => clean(c.innerText)));
      const head = rows[0]?.[0] || "";
      if (/^PASSAGEIROS/i.test(head)) {
        for (const r of rows.slice(2)) {
          if (r.length < 6) continue;
          passengers.push({
            firstName: r[0],
            lastName: r[1],
            faixa: r[2],
            birth: r[3],
            sex: r[4],
            document: r[5].replace(/\D/g, "").length === 11 ? r[5].replace(/\D/g, "") : r[5],
          });
        }
        return;
      }
      const dir = /^VOLTA/i.test(head) ? "VOLTA" : /^IDA/i.test(head) ? "IDA" : null;
      if (!dir) return;
      const segments = [];
      let miles = 0;
      for (const r of rows.slice(2)) {
        // 1ª linha tem a cia na frente (8 colunas); conexões vêm sem ela (6+)
        const off = r.length >= 8 ? 1 : 0;
        const flight = r[off] || "";
        if (!/^[A-Z0-9]{2}\d{2,5}$/.test(flight)) continue;
        segments.push({
          flight,
          date: brToIso(r[off + 3]),
          from: iata(r[off + 4]),
          to: iata(r[off + 5]),
        });
        if (r.length >= 8) miles = intBr(r[7]) || miles;
      }
      if (segments.length) {
        legs.push({
          direction: dir,
          from: segments[0].from,
          to: segments[segments.length - 1].to,
          date: segments[0].date,
          miles,
          segments,
        });
      }
    });

    const counts = { adt: 0, chd: 0, inf: 0 };
    for (const p of passengers) {
      if (/beb/i.test(p.faixa)) counts.inf++;
      else if (/crian/i.test(p.faixa)) counts.chd++;
      else counts.adt++;
    }

    const milesByFaixa = {};
    document.querySelectorAll("input[data-milhas]").forEach((el) => {
      const k = `${el.dataset.milhas}:${el.dataset.faixa || "Adulto"}`;
      milesByFaixa[k] = Number(el.value || 0) || 0;
    });

    return {
      code,
      pedido,
      url: location.href,
      title: h1,
      limitTaxCents: moneyCents(dl["taxas"]),
      limitMiles: intBr(dl["milhas"]),
      trip: legs.some((l) => l.direction === "VOLTA") ? "IDA_VOLTA" : "IDA",
      legs,
      passengers,
      counts,
      milesByFaixa,
    };
  }

  // ===== preenchimento =====
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function setVal(el, v) {
    if (!el || v == null || v === "") return false;
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    el.focus();
    setter ? setter.call(el, String(v)) : (el.value = String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }
  const fmtCpf = (d) => {
    const s = String(d || "").replace(/\D/g, "");
    return s.length === 11 ? `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}` : s;
  };

  async function fillForm(fill) {
    const radio = document.querySelector('input[name="resultado"][value="emitido"]');
    if (radio && !radio.checked) {
      radio.click();
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    for (let i = 0; i < 20 && document.querySelector("#localizador")?.disabled; i++) await sleep(100);

    const done = [];
    const missing = [];
    const mark = (ok, label) => (ok ? done : missing).push(label);

    mark(setVal(document.querySelector("#localizador"), String(fill.locator || "").toUpperCase()), "Localizador");
    mark(setVal(document.querySelector("#numero-ordem"), String(fill.purchaseCode || "").toUpperCase()), "Ordem de compra");

    const taxa = (dir) => document.querySelector(`input[data-taxa="${dir}"][data-tipo="embarque"]`) || document.querySelector(`input[data-taxa="${dir}"]`);
    const toNum = (c) => (c == null ? "" : (Number(c) / 100).toFixed(2));
    mark(setVal(taxa("IDA"), toNum(fill.taxIdaPerPaxCents)), "Taxa ida");
    if (taxa("VOLTA")) mark(setVal(taxa("VOLTA"), toNum(fill.taxVoltaPerPaxCents)), "Taxa volta");

    const f = fill.fonte || {};
    const fonte = (k) => document.querySelector(`input[data-fonte="${k}"]`);
    mark(setVal(fonte("nome"), f.nome), "Nome da fonte");
    mark(setVal(fonte("cpf"), fmtCpf(f.cpf)), "CPF da fonte");
    mark(setVal(fonte("email"), f.email), "E-mail da fonte");
    mark(setVal(fonte("nascimento"), f.birthIso), "Nascimento da fonte");

    // E-tickets: só se vierem (casados pelo nome)
    const tickets = fill.etickets || {};
    document.querySelectorAll("input[data-eticket]").forEach((el) => {
      const name = clean(el.closest("tr")?.cells?.[0]?.innerText).toUpperCase();
      const t = tickets[name];
      if (t) setVal(el, t);
      else el.style.outline = "2px solid #f59e0b";
    });

    return { done, missing };
  }

  // ===== painel =====
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:300px;background:#0f172a;color:#fff;border-radius:14px;padding:12px 14px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3)";
  panel.innerHTML =
    '<div style="font-weight:700;margin-bottom:6px">TradeMiles · Voar Fácil</div>' +
    '<div data-tm-msg style="color:#cbd5e1">Lendo pedido…</div>' +
    '<div style="display:flex;gap:6px;margin-top:10px">' +
    '<button data-tm-send style="flex:1;border:0;border-radius:8px;padding:7px;background:#334155;color:#fff;cursor:pointer">Reenviar pedido</button>' +
    '<button data-tm-fill style="flex:1;border:0;border-radius:8px;padding:7px;background:#10b981;color:#fff;font-weight:700;cursor:pointer">Preencher</button>' +
    "</div>";
  const msg = (t) => (panel.querySelector("[data-tm-msg]").textContent = t);

  function send(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) =>
          resolve(res || { ok: false, error: chrome.runtime.lastError?.message || "Sem resposta." })
        );
      } catch (e) {
        resolve({ ok: false, error: "Extensão recarregada — dê F5 na página." });
      }
    });
  }

  async function capture() {
    const order = readOrder();
    if (!order.code || !order.passengers.length) {
      msg("Não achei o pedido nesta página (link expirado?).");
      return;
    }
    const res = await send("TM_VF_CAPTURE", { order });
    if (!res.ok) return msg(res.error || "Falha ao enviar ao TradeMiles.");
    const pax = order.passengers.length;
    msg(
      `Pedido ${order.pedido || ""} no TradeMiles ✓ · ${pax} pax · ${order.legs
        .map((l) => `${l.from}→${l.to}`)
        .join(" / ")}. Na emissão, use "Voar Fácil".` + (res.data?.hasFill ? " Venda pronta para preencher." : "")
    );
  }

  panel.querySelector("[data-tm-send]").addEventListener("click", () => void capture());
  panel.querySelector("[data-tm-fill]").addEventListener("click", async () => {
    const order = readOrder();
    msg("Buscando dados da venda…");
    const res = await send("TM_VF_GET_FILL", { code: order.code });
    if (!res.ok) return msg(res.error || "Falha ao buscar a venda.");
    if (!res.data?.fill) return msg('Ainda sem venda. No TradeMiles, salve a venda e clique "Preencher Voar Fácil".');
    const r = await fillForm(res.data.fill);
    msg(
      `Preenchido (venda ${res.data.fill.saleNumero || ""}). ` +
        (r.missing.length ? `Faltou: ${r.missing.join(", ")}. ` : "") +
        "E-tickets em amarelo: confira e clique Enviar."
    );
  });

  window.__tmVoarFacilRead = readOrder;
  document.body.appendChild(panel);
  void capture();
})();
