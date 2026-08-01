/**
 * Pagamento LATAM REDEMPTION — /v2/pagamentos/?…&flow=BOOKING-REDEMPTION
 * - Vencimento: MM/AA
 * - Estado: lista suspensa (nome completo, ex. Rio Grande do Sul)
 * - Sem CVV
 */

const BR_STATES = [
  ["AC", "Acre"],
  ["AL", "Alagoas"],
  ["AP", "Amapa"],
  ["AM", "Amazonas"],
  ["BA", "Bahia"],
  ["CE", "Ceara"],
  ["DF", "Distrito Federal"],
  ["ES", "Espirito Santo"],
  ["GO", "Goias"],
  ["MA", "Maranhao"],
  ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"],
  ["PA", "Para"],
  ["PB", "Paraiba"],
  ["PR", "Parana"],
  ["PE", "Pernambuco"],
  ["PI", "Piaui"],
  ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"],
  ["RO", "Rondonia"],
  ["RR", "Roraima"],
  ["SC", "Santa Catarina"],
  ["SP", "Sao Paulo"],
  ["SE", "Sergipe"],
  ["TO", "Tocantins"],
];

// Nomes com acento (texto da LATAM)
const BR_STATES_DISPLAY = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

function setNativeValue(el, value) {
  if (!el || value == null || value === "") return false;
  const str = String(value);
  const tag = el.tagName;

  if (tag === "SELECT") {
    const needle = normalizeLabel(str);
    const opt = Array.from(el.options || []).find((o) => {
      const t = normalizeLabel(o.textContent || "");
      const v = normalizeLabel(o.value || "");
      return t === needle || v === needle || t.includes(needle) || v === needle;
    });
    if (!opt) return false;
    el.focus?.();
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
  el.focus?.();
  const tracker = el._valueTracker;
  if (tracker) {
    try {
      tracker.setValue("");
    } catch {
      /* ignore */
    }
  }
  if (setter) setter.call(el, str);
  else el.value = str;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(
    new InputEvent("input", { bubbles: true, data: str, inputType: "insertText" })
  );
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

function fieldMeta(el) {
  const bits = [
    el.getAttribute("aria-label"),
    el.getAttribute("name"),
    el.getAttribute("placeholder"),
    el.getAttribute("id"),
    el.getAttribute("data-testid"),
    el.getAttribute("autocomplete"),
  ];
  if (el.labels?.[0]) bits.push(textOf(el.labels[0]));
  let p = el.parentElement;
  for (let i = 0; i < 5 && p; i++) {
    const lab = p.querySelector?.(
      ":scope > label, :scope > span, :scope > p, legend"
    );
    if (lab) bits.push(textOf(lab));
    p = p.parentElement;
  }
  return normalizeLabel(bits.filter(Boolean).join(" | "));
}

function findField(root, labelNeedles) {
  const needles = (Array.isArray(labelNeedles) ? labelNeedles : [labelNeedles]).map(
    normalizeLabel
  );
  const inputs = [
    ...root.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea"
    ),
  ];
  for (const el of inputs) {
    const meta = fieldMeta(el);
    if (needles.some((n) => {
      const re = new RegExp(`(^|[^a-z])${n.replace(/\s+/g, "\\s+")}([^a-z]|$)`);
      return re.test(meta);
    })) {
      return el;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveState(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const uf = s.toUpperCase();
  if (BR_STATES_DISPLAY[uf]) {
    return { uf, name: BR_STATES_DISPLAY[uf] };
  }
  const norm = normalizeLabel(s);
  for (const [code, nameAscii] of BR_STATES) {
    if (normalizeLabel(nameAscii) === norm || normalizeLabel(BR_STATES_DISPLAY[code]) === norm) {
      return { uf: code, name: BR_STATES_DISPLAY[code] };
    }
  }
  return { uf: s, name: s };
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

  if (!cardFormOpen()) {
    for (const r of document.querySelectorAll('input[type="radio"]')) {
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

/** LATAM: vencimento MM/AA */
function fillExpiry(card) {
  if (!card?.expMonth || !card?.expYear) return false;
  const mm = String(card.expMonth).padStart(2, "0");
  const yy = String(card.expYear).slice(-2);
  const el = findField(document.body, ["vencimento"]);
  if (!el) return false;
  return setNativeValue(el, `${mm}/${yy}`);
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

async function selectEstado(stateRaw) {
  const resolved = resolveState(stateRaw);
  if (!resolved) return false;
  const { uf, name } = resolved;
  const el = findField(document.body, ["estado"]);
  if (!el) return false;

  if (el.tagName === "SELECT") {
    if (setNativeValue(el, name)) return true;
    if (setNativeValue(el, uf)) return true;
    return false;
  }

  // Lista suspensa custom
  el.click?.();
  el.focus?.();
  await sleep(250);

  const opts = Array.from(
    document.querySelectorAll(
      '[role="option"], li[role="option"], li, button, span, div'
    )
  );
  const want = [normalizeLabel(name), normalizeLabel(uf)];
  const hit = opts.find((o) => {
    const t = normalizeLabel(textOf(o));
    if (!t || t.length > 40) return false;
    return want.some((w) => t === w || t.startsWith(`${w} `) || t.includes(w));
  });
  if (hit) {
    hit.click?.();
    return true;
  }
  // tenta digitar no combobox
  if (el.tagName === "INPUT") {
    setNativeValue(el, name);
    await sleep(200);
    const hit2 = opts.find((o) => normalizeLabel(textOf(o)) === normalizeLabel(name));
    hit2?.click?.();
    return true;
  }
  return false;
}

function fillCard(card) {
  if (!card) return;
  if (card.pan) {
    setNativeValue(
      findField(document.body, ["número do cartão", "numero do cartao"]),
      String(card.pan).replace(/\D/g, "")
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

async function fillBilling(card) {
  if (!card) return;
  const { first, last } = splitHolder(card.holderName || "");

  if (first) {
    setNativeValue(
      findField(document.body, ["nome(s)", "nomes"]) ||
        findField(document.body, ["nome"]),
      first
    );
  }
  if (last) {
    setNativeValue(
      findField(document.body, ["sobrenome(s)", "sobrenomes"]) ||
        findField(document.body, ["sobrenome"]),
      last
    );
  }

  // Endereço = rua + número (como no banco)
  const streetLine = [card.street, card.number].filter(Boolean).join(" ").trim();
  if (streetLine) {
    setNativeValue(
      findField(document.body, ["endereço", "endereco"]),
      streetLine
    );
  }
  if (card.complement) {
    setNativeValue(
      findField(document.body, [
        "apartamento ou escritorio",
        "apartamento ou escritório",
        "apartamento",
      ]),
      card.complement
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
    await selectEstado(card.state);
  }

  // País Brasil se existir
  const pais = findField(document.body, ["pais", "país"]);
  if (pais) {
    if (pais.tagName === "SELECT") setNativeValue(pais, "Brasil");
  }
}

function ensureFab() {
  if (document.getElementById("tm-latam-pay-fab")) return;
  const btn = document.createElement("button");
  btn.id = "tm-latam-pay-fab";
  btn.type = "button";
  btn.textContent = "Preencher cartão TM";
  btn.style.cssText =
    "position:fixed;bottom:20px;right:16px;z-index:2147483647;height:40px;padding:0 14px;border:0;border-radius:999px;background:#0f172a;color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(15,23,42,.35);";
  btn.addEventListener("click", () => void runFill());
  document.documentElement.appendChild(btn);
}

async function runFill() {
  ensureFab();
  if (/passageiros/i.test(location.pathname)) return;

  const res = await chrome.runtime.sendMessage({ type: "TM_GET_FILL_PAYLOAD" });
  if (!res?.ok || !res.data?.useExtension) {
    console.info("[TradeMiles] Extensão desligada ou sem sessão.");
    return;
  }
  const card = res.data.paymentCard;
  if (!card) {
    console.info("[TradeMiles] Sem cartão na sessão.");
    return;
  }

  await sleep(600);
  const opened = await openAddCard();
  if (!opened) {
    console.info("[TradeMiles] Clique em Adicionar cartão e use Preencher cartão TM.");
    return;
  }

  await sleep(350);
  fillCard(card);
  await fillBilling(card);

  console.info(
    "[TradeMiles] Cartão (MM/AA) + cobrança. Digite o CVV e revise o estado."
  );
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "TM_RUN_FILL") {
    runFill().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

ensureFab();
runFill().catch((e) => console.warn("[TradeMiles]", e));
setTimeout(() => void runFill(), 2000);
