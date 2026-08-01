/**
 * Pagamento LATAM REDEMPTION — /v2/pagamentos/?…&flow=BOOKING-REDEMPTION
 * Cartão + dados de cobrança. Sem CVV.
 */

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
    .replace(/[()]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isVisible(el) {
  if (!el) return false;
  const st = window.getComputedStyle(el);
  if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
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
  for (let i = 0; i < 6 && p; i++) {
    const lab = p.querySelector?.(
      ":scope > label, :scope > span, :scope > p, legend"
    );
    if (lab) bits.push(textOf(lab));
    const prev = p.previousElementSibling;
    if (prev && /label|span|p|div/i.test(prev.tagName)) bits.push(textOf(prev));
    p = p.parentElement;
  }
  return normalizeLabel(bits.filter(Boolean).join(" | "));
}

function setNativeValue(el, value) {
  if (!el || value == null || value === "") return false;
  const str = String(value);
  const tag = el.tagName;

  if (tag === "SELECT") {
    const needle = normalizeLabel(str);
    const opt = Array.from(el.options || []).find((o) => {
      const t = normalizeLabel(o.textContent || "");
      const v = normalizeLabel(o.value || "");
      return t === needle || v === needle || t.includes(needle);
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
  let out = str;
  if (el.maxLength > 0 && out.length > el.maxLength) out = out.slice(0, el.maxLength);
  if (setter) setter.call(el, out);
  else el.value = out;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(
    new InputEvent("input", { bubbles: true, data: out, inputType: "insertText" })
  );
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

/** Digita caractere a caractere (máscaras React da LATAM). */
async function typeChars(el, value) {
  if (!el || value == null || value === "") return false;
  const str = String(value);
  el.focus?.();
  el.click?.();

  const proto = HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, "");
  else el.value = "";
  el.dispatchEvent(new Event("input", { bubbles: true }));

  let cur = "";
  for (const ch of str) {
    cur += ch;
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: ch, bubbles: true, cancelable: true })
    );
    el.dispatchEvent(
      new KeyboardEvent("keypress", { key: ch, bubbles: true, cancelable: true })
    );
    const tracker = el._valueTracker;
    if (tracker) {
      try {
        tracker.setValue(cur.slice(0, -1));
      } catch {
        /* ignore */
      }
    }
    if (setter) setter.call(el, cur);
    else el.value = cur;
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: ch,
        inputType: "insertText",
      })
    );
    el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
    await sleep(25);
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

function findField(root, words, { excludeWords = [], requireWords = [] } = {}) {
  const needles = (Array.isArray(words) ? words : [words]).map(normalizeLabel);
  const excludes = excludeWords.map(normalizeLabel);
  const requires = requireWords.map(normalizeLabel);
  const inputs = [
    ...root.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, [role='combobox']"
    ),
  ].filter(isVisible);

  for (const el of inputs) {
    const meta = fieldMeta(el);
    if (excludes.some((ex) => meta.includes(ex))) continue;
    if (requires.length && !requires.every((r) => meta.includes(r))) continue;
    const ok = needles.some((n) => {
      const re = new RegExp(`(^|[^a-z0-9])${escapeRe(n)}([^a-z0-9]|$)`);
      return re.test(meta);
    });
    if (ok) return el;
  }
  return null;
}

function findSectionByHeading(re) {
  const nodes = Array.from(
    document.querySelectorAll("h1, h2, h3, h4, h5, legend, strong, span, div, p")
  );
  for (const el of nodes) {
    const t = textOf(el);
    if (!re.test(t) || t.length > 60) continue;
    let root = el.parentElement;
    for (let i = 0; i < 8 && root; i++) {
      const n = root.querySelectorAll("input, select").length;
      if (n >= 2) return root;
      root = root.parentElement;
    }
  }
  return document.body;
}

function resolveState(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const uf = s.toUpperCase();
  if (BR_STATES_DISPLAY[uf]) return { uf, name: BR_STATES_DISPLAY[uf] };
  const norm = normalizeLabel(s);
  for (const [code, name] of Object.entries(BR_STATES_DISPLAY)) {
    if (normalizeLabel(name) === norm) return { uf: code, name };
  }
  return { uf: s, name: s };
}

function splitHolder(name) {
  const parts = String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function addressLine(card) {
  const street = String(card.street || "").trim();
  const number = String(card.number || "").trim();
  if (!street) return number;
  // Se a rua já termina com número, não concatena de novo
  if (/\d+\s*$/.test(street) || !number) return street;
  if (street.toLowerCase().includes(number.toLowerCase())) return street;
  return `${street} ${number}`.trim();
}

function cardFormOpen() {
  return Boolean(
    findField(document.body, ["numero do cartao", "número do cartão"]) ||
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
      (t.includes("adicionar cartao") && t.length < 80)
    );
  });
  if (hit) {
    (hit.closest("button, [role='button'], label") || hit).click();
    await sleep(600);
  }
  if (!cardFormOpen()) {
    for (const r of document.querySelectorAll('input[type="radio"]')) {
      const wrap = r.closest("div, label, li");
      if (wrap && /adicionar cart/i.test(textOf(wrap))) {
        r.click();
        await sleep(500);
        break;
      }
    }
  }
  return cardFormOpen();
}

async function fillExpiry(el, card) {
  if (!el || !card?.expMonth || !card?.expYear) return false;
  const mm = String(card.expMonth).padStart(2, "0");
  const yy = String(card.expYear).slice(-2);
  // Máscara LATAM: digitar só os 4 dígitos
  await typeChars(el, `${mm}${yy}`);
  await sleep(80);
  const digits = String(el.value || "").replace(/\D/g, "");
  if (
    digits === `${mm}${yy}` ||
    new RegExp(`${mm}\\s*\\/\\s*${yy}`).test(String(el.value || ""))
  ) {
    return true;
  }
  // fallback
  return setNativeValue(el, `${mm}/${yy}`);
}

async function selectDropdown(el, label) {
  if (!el || !label) return false;
  const want = normalizeLabel(label);

  if (el.tagName === "SELECT") {
    return setNativeValue(el, label);
  }

  // Fecha listas abertas
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
  await sleep(100);

  el.focus?.();
  el.click?.();
  await sleep(350);

  const collect = () =>
    Array.from(
      document.querySelectorAll(
        '[role="option"], li[role="option"], [role="listbox"] li, ul li, div[class*="option"]'
      )
    ).filter(isVisible);

  let opts = collect();
  for (let i = 0; i < 8 && opts.length < 5; i++) {
    await sleep(120);
    opts = collect();
  }

  const hit =
    opts.find((o) => normalizeLabel(textOf(o)) === want) ||
    opts.find((o) => {
      const t = normalizeLabel(textOf(o));
      return t && t.length < 40 && (t === want || t.startsWith(want));
    });

  if (hit) {
    hit.scrollIntoView?.({ block: "nearest" });
    hit.click?.();
    hit.dispatchEvent?.(new MouseEvent("mousedown", { bubbles: true }));
    hit.dispatchEvent?.(new MouseEvent("mouseup", { bubbles: true }));
    await sleep(150);
    return true;
  }

  // Combobox digitável
  if (el.tagName === "INPUT" || el.getAttribute("role") === "combobox") {
    await typeChars(el, label);
    await sleep(250);
    opts = collect();
    const hit2 = opts.find((o) => normalizeLabel(textOf(o)) === want);
    if (hit2) {
      hit2.click?.();
      return true;
    }
  }
  return false;
}

async function fillCard(card) {
  const cardRoot = findSectionByHeading(/número do cartão|numero do cartao/i);

  if (card.pan) {
    const panEl = findField(cardRoot, ["numero do cartao", "número do cartão"]);
    if (panEl) await typeChars(panEl, String(card.pan).replace(/\D/g, ""));
  }

  // Campo único "Nome e sobrenome" do cartão — nome completo
  const holderEl =
    findField(cardRoot, ["nome e sobrenome"]) ||
    findField(document.body, ["nome e sobrenome"], {
      excludeWords: ["cobranca", "cobrança", "nome s", "sobrenome s"],
    });
  if (holderEl && card.holderName) {
    await typeChars(holderEl, card.holderName.trim());
  }

  const expEl =
    findField(cardRoot, ["vencimento"]) ||
    findField(document.body, ["vencimento"]);
  await fillExpiry(expEl, card);
}

async function fillBilling(card) {
  const billRoot =
    findSectionByHeading(/dados de cobrança|dados de cobranca/i) ||
    document.body;

  const { first, last } = splitHolder(card.holderName || "");

  // Nome(s) / Sobrenome(s) — NÃO tocar no "Nome e sobrenome" do cartão
  const nomeEl =
    findField(billRoot, ["nomes", "nome s"], {
      excludeWords: ["sobrenome", "cartao", "cartão", "nome e sobrenome"],
    }) ||
    findField(billRoot, ["nome"], {
      excludeWords: ["sobrenome", "cartao", "cartão", "nome e sobrenome", "usuario"],
    });
  const sobEl = findField(billRoot, ["sobrenomes", "sobrenome s", "sobrenome"], {
    excludeWords: ["nome e sobrenome"],
  });

  if (first && nomeEl) await typeChars(nomeEl, first);
  if (last && sobEl) await typeChars(sobEl, last);

  if (card.birthDate) {
    const birthEl = findField(billRoot, [
      "data de nascimento",
      "nascimento",
    ]);
    if (birthEl) {
      const digits = String(card.birthDate).replace(/\D/g, "");
      // ddmmAAAA
      if (digits.length >= 8) await typeChars(birthEl, digits.slice(0, 8));
      else await typeChars(birthEl, card.birthDate);
    }
  }

  if (card.cpf) {
    const cpfEl = findField(billRoot, ["cpf"]);
    if (cpfEl) await typeChars(cpfEl, String(card.cpf).replace(/\D/g, ""));
  }

  if (card.email) {
    const emailEl = findField(billRoot, ["email", "e-mail"]);
    if (emailEl) await typeChars(emailEl, card.email);
  }

  const addr = addressLine(card);
  if (addr) {
    const endEl = findField(billRoot, ["endereco", "endereço"], {
      excludeWords: ["email"],
    });
    if (endEl) await typeChars(endEl, addr);
  }

  if (card.complement) {
    const compEl = findField(billRoot, [
      "apartamento ou escritorio",
      "apartamento ou escritório",
      "apartamento",
      "complemento",
    ]);
    if (compEl) await typeChars(compEl, card.complement);
  }

  const paisEl = findField(billRoot, ["pais", "país"]);
  if (paisEl) await selectDropdown(paisEl, "Brasil");

  if (card.state) {
    const resolved = resolveState(card.state);
    const estadoEl = findField(billRoot, ["estado"]);
    if (estadoEl && resolved) {
      const ok = await selectDropdown(estadoEl, resolved.name);
      if (!ok) await selectDropdown(estadoEl, resolved.uf);
    }
  }

  if (card.city) {
    const cityEl = findField(billRoot, ["cidade"]);
    if (cityEl) await typeChars(cityEl, card.city);
  }

  if (card.zip) {
    const zipEl = findField(billRoot, [
      "codigo postal",
      "código postal",
      "cep",
    ]);
    if (zipEl) await typeChars(zipEl, String(card.zip).replace(/\D/g, ""));
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
  if (card.error) {
    console.warn("[TradeMiles]", card.error);
  }

  await sleep(500);
  const opened = await openAddCard();
  if (!opened) {
    console.info("[TradeMiles] Abra Adicionar cartão e clique Preencher cartão TM.");
    return;
  }

  await sleep(400);
  await fillCard(card);
  await sleep(200);
  await fillBilling(card);

  console.info(
    "[TradeMiles] Preenchido. Digite o CVV e confira estado / validade."
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
// Não auto-preenche na carga — evita abrir lista do estado sozinha;
// usuário clica no botão (ou popup).
setTimeout(ensureFab, 1500);
