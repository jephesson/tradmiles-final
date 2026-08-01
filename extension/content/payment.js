/**
 * Content script — pagamento LATAM REDEMPTION:
 * /br/pt/v2/pagamentos/?orderId=LA…&flow=BOOKING-REDEMPTION
 *
 * Fluxo:
 * 1) Clica em "Adicionar cartão" se o form ainda não estiver aberto
 * 2) Preenche número, nome, vencimento (SEM CVV)
 * 3) Dados de cobrança já abrem — endereço/nome/CPF/e-mail/CEP
 */

function setNativeValue(el, value) {
  if (!el || value == null || value === "") return false;
  const tag = el.tagName;
  if (tag === "SELECT") {
    const needle = String(value).toLowerCase();
    const opt = Array.from(el.options || []).find((o) => {
      const t = (o.textContent || "").trim().toLowerCase();
      const v = String(o.value || "").toLowerCase();
      return t === needle || t.includes(needle) || v === needle;
    });
    if (!opt) return false;
    el.value = opt.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  const proto =
    tag === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, String(value));
  else el.value = String(value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

function textOf(el) {
  return (el?.textContent || "").replace(/\s+/g, " ").trim();
}

function normalizeLabel(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[º°]/g, "o")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findField(root, labelNeedles, { exact = false } = {}) {
  const needles = (Array.isArray(labelNeedles) ? labelNeedles : [labelNeedles]).map(
    (n) => normalizeLabel(n)
  );
  const nodes = root.querySelectorAll("label, span, p, legend, div");
  for (const node of nodes) {
    const t = normalizeLabel(textOf(node));
    if (!t || t.length > 110) continue;
    const ok = needles.some((n) => (exact ? t === n : t === n || t.startsWith(`${n} `)));
    if (!ok) continue;

    const forId = node.getAttribute?.("for");
    if (forId) {
      const byFor =
        root.querySelector(`#${CSS.escape(forId)}`) || document.getElementById(forId);
      if (byFor) {
        if (byFor.matches("input, select, textarea")) return byFor;
        const inner = byFor.querySelector?.("input, select, textarea");
        if (inner) return inner;
      }
    }

    let cur = node;
    for (let i = 0; i < 6 && cur; i++) {
      const input = cur.querySelector?.(
        "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea"
      );
      if (input) return input;
      cur = cur.parentElement;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cardFormOpen() {
  return Boolean(
    findField(document.body, ["número do cartão", "numero do cartao"]) ||
      findField(document.body, ["vencimento"])
  );
}

async function openAddCard() {
  if (cardFormOpen()) return true;

  const candidates = Array.from(
    document.querySelectorAll("button, [role='button'], label, div, span, li")
  );
  const hit = candidates.find((el) => {
    const t = normalizeLabel(textOf(el));
    return (
      t === "adicionar cartao" ||
      t.startsWith("adicionar cartao") ||
      (t.includes("adicionar cartao") && t.length < 80)
    );
  });
  if (hit) {
    (hit.closest("button, [role='button'], label") || hit).click();
    await sleep(500);
  }

  // Radio à direita do card
  if (!cardFormOpen()) {
    const radios = Array.from(
      document.querySelectorAll('input[type="radio"]')
    );
    for (const r of radios) {
      const wrap = r.closest("div, label, li");
      if (wrap && /adicionar cart/i.test(textOf(wrap))) {
        r.click();
        await sleep(400);
        break;
      }
    }
  }

  return cardFormOpen();
}

function fillExpiry(card) {
  if (!card?.expMonth || !card?.expYear) return;
  const mm = String(card.expMonth).padStart(2, "0");
  const yyyy = String(card.expYear);
  const yy = yyyy.slice(-2);
  const el = findField(document.body, ["vencimento"]);
  if (!el) return;
  // Tenta MM/AA e MM/AAAA
  if (!setNativeValue(el, `${mm}/${yy}`)) setNativeValue(el, `${mm}/${yyyy}`);
}

function splitHolder(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function fillCard(card) {
  if (!card) return;
  if (card.pan) {
    setNativeValue(
      findField(document.body, ["número do cartão", "numero do cartao"]),
      card.pan
    );
  }
  if (card.holderName) {
    setNativeValue(
      findField(document.body, ["nome e sobrenome"]),
      card.holderName
    );
  }
  fillExpiry(card);
}

function fillBilling(card) {
  if (!card) return;
  const { first, last } = splitHolder(card.holderName || "");

  setNativeValue(findField(document.body, ["nome(s)", "nomes"], { exact: true }), first);
  // fallback se label for só Nome(s)
  if (first) {
    const n =
      findField(document.body, ["nome(s)"]) ||
      findField(document.body, ["nomes"]);
    setNativeValue(n, first);
  }
  if (last) {
    setNativeValue(
      findField(document.body, ["sobrenome(s)", "sobrenomes"]),
      last
    );
  }

  // Endereço já abre neste layout
  if (card.street) {
    setNativeValue(findField(document.body, ["endereço", "endereco"]), card.street);
  }
  if (card.complement || card.number) {
    const apt = [card.number, card.complement].filter(Boolean).join(" ").trim();
    setNativeValue(
      findField(document.body, [
        "apartamento ou escritorio",
        "apartamento ou escritório",
        "apartamento",
      ]),
      apt || card.complement
    );
  }
  if (card.city) {
    setNativeValue(findField(document.body, ["cidade"]), card.city);
  }
  if (card.zip) {
    setNativeValue(
      findField(document.body, ["código postal", "codigo postal", "cep"]),
      String(card.zip).replace(/\D/g, "")
    );
  }
  if (card.state) {
    const st = findField(document.body, ["estado"]);
    if (st) setNativeValue(st, card.state);
  }
}

async function run() {
  // Não roda na tela de passageiros
  if (/passageiros/i.test(location.pathname)) return;

  const res = await chrome.runtime.sendMessage({ type: "TM_GET_FILL_PAYLOAD" });
  if (!res?.ok || !res.data?.useExtension) return;
  const card = res.data.paymentCard;
  if (!card) {
    console.info("[TradeMiles] Sem cartão na sessão de pagamento.");
    return;
  }

  await sleep(700);
  const opened = await openAddCard();
  if (!opened) {
    console.info("[TradeMiles] Não abriu o formulário de cartão — clique em Adicionar cartão.");
    return;
  }

  await sleep(300);
  fillCard(card);
  fillBilling(card);

  console.info(
    "[TradeMiles] Cartão + cobrança preenchidos (sem CVV). Digite o CVV e revise."
  );
}

run().catch((e) => console.warn("[TradeMiles]", e));
