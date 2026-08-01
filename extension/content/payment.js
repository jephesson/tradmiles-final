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

function realClick(el) {
  if (!el) return;
  const opts = { bubbles: true, cancelable: true, view: window };
  el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  el.focus?.();
  for (const type of [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
  ]) {
    el.dispatchEvent(new MouseEvent(type, opts));
  }
  // click nativo por cima (alguns handlers só escutam isso)
  try {
    el.click();
  } catch {
    /* ignore */
  }
}

function collectDropdownOptions() {
  const sels = [
    '[role="listbox"] [role="option"]',
    '[role="option"]',
    "ul[role='listbox'] li",
    "[class*='Menu'] li",
    "[class*='menu'] li",
    "[class*='Dropdown'] li",
    "[class*='dropdown'] li",
    "[class*='Select'] li",
    "[class*='option']",
    "li",
  ];
  const seen = new Set();
  const out = [];
  for (const sel of sels) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el) || !isVisible(el)) continue;
      const t = textOf(el);
      if (!t || t.length > 48) continue;
      // ignora itens de UI genéricos
      if (/^(selecione|buscar|pesquisar|fechar)$/i.test(t)) continue;
      seen.add(el);
      out.push(el);
    }
  }
  return out;
}

function matchOption(el, want) {
  const t = normalizeLabel(textOf(el));
  if (!t) return false;
  if (t === want) return true;
  // "Rio Grande do Sul" / "RS - Rio Grande do Sul"
  if (t.startsWith(`${want} `) || t.endsWith(` ${want}`) || t.includes(` - ${want}`) || t.includes(`${want} -`)) {
    return true;
  }
  return false;
}

function dropdownShowsValue(el, want) {
  if (!el) return false;
  const t = normalizeLabel(
    el.value || el.getAttribute("value") || textOf(el) || ""
  );
  return Boolean(t && (t === want || t.includes(want)));
}

async function selectDropdown(el, label) {
  if (!el || !label) return false;
  const want = normalizeLabel(label);
  const wantRaw = String(label).trim();

  if (el.tagName === "SELECT") {
    return setNativeValue(el, label);
  }

  // Gatilho: botão/combobox perto do input
  const trigger =
    el.closest?.("button, [role='combobox'], [aria-haspopup='listbox']") ||
    el.parentElement?.querySelector?.(
      "button, [role='combobox'], [aria-haspopup='listbox'], svg"
    )?.closest?.("button, [role='combobox'], [aria-haspopup]") ||
    el;

  // 1) Abrir lista
  realClick(trigger);
  if (trigger !== el) realClick(el);
  await sleep(400);

  // 2) Se for input/combobox, digita para filtrar a lista
  const editable =
    el.tagName === "INPUT" ||
    el.getAttribute("role") === "combobox" ||
    el.isContentEditable;
  if (editable) {
    await typeChars(el, wantRaw);
    await sleep(350);
  }

  // 3) Acha a opção e clica de verdade
  let opts = collectDropdownOptions();
  for (let i = 0; i < 12 && opts.length < 3; i++) {
    await sleep(120);
    opts = collectDropdownOptions();
  }

  let hit =
    opts.find((o) => normalizeLabel(textOf(o)) === want) ||
    opts.find((o) => matchOption(o, want));

  // Preferir o nó folha com o texto exato
  if (hit) {
    const leaf = [...hit.querySelectorAll("*")].find(
      (n) => normalizeLabel(textOf(n)) === want && isVisible(n)
    );
    if (leaf) hit = leaf;
    realClick(hit);
    await sleep(200);
    if (dropdownShowsValue(el, want) || dropdownShowsValue(trigger, want)) {
      return true;
    }
    // tenta de novo no container da opção
    realClick(hit.closest?.("[role='option'], li") || hit);
    await sleep(200);
    if (dropdownShowsValue(el, want) || dropdownShowsValue(trigger, want)) {
      return true;
    }
  }

  // 4) Teclado: ArrowDown + Enter na opção filtrada
  el.focus?.();
  trigger.focus?.();
  for (const key of ["ArrowDown", "Enter"]) {
    const ke = { key, code: key, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", ke));
    trigger.dispatchEvent(new KeyboardEvent("keydown", ke));
    document.activeElement?.dispatchEvent?.(new KeyboardEvent("keydown", ke));
    await sleep(80);
  }
  await sleep(200);
  if (dropdownShowsValue(el, want) || dropdownShowsValue(trigger, want)) {
    return true;
  }

  // 5) Última tentativa: clicar em qualquer nó visível com o texto do estado
  const loose = [...document.querySelectorAll("li, div, span, button, p")].find(
    (o) => {
      if (!isVisible(o)) return false;
      const t = normalizeLabel(textOf(o));
      return t === want && t.length < 40;
    }
  );
  if (loose) {
    realClick(loose.closest("[role='option'], li, button") || loose);
    await sleep(200);
    return (
      dropdownShowsValue(el, want) ||
      dropdownShowsValue(trigger, want) ||
      true
    );
  }

  return false;
}

/** Estado LATAM: tenta nome completo e UF. */
async function selectEstado(estadoEl, resolved) {
  if (!estadoEl || !resolved) return false;
  const names = [resolved.name, resolved.uf].filter(Boolean);
  for (const name of names) {
    const ok = await selectDropdown(estadoEl, name);
    if (ok) return true;
    // fecha e tenta de novo
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await sleep(200);
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

function findByAutocomplete(root, names) {
  const list = Array.isArray(names) ? names : [names];
  for (const name of list) {
    const el = [...root.querySelectorAll(`input[autocomplete="${name}"], input[autocomplete*="${name}" i]`)].find(
      isVisible
    );
    if (el) return el;
  }
  return null;
}

async function fillInput(el, value) {
  if (!el || value == null || value === "") return false;
  const str = String(value);
  await typeChars(el, str);
  await sleep(40);
  if (String(el.value || "").replace(/\s+/g, " ").trim()) return true;
  return setNativeValue(el, str);
}

function findBillingField(billRoot, words, opts = {}) {
  return (
    findField(billRoot, words, opts) ||
    findField(document.body, words, opts)
  );
}

/** Normaliza dd/mm/aaaa ou aaaa-mm-dd → { digits: ddmmyyyy, pretty } */
function parseBillingBirth(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let d;
  let m;
  let y;
  const br = s.match(/^(\d{1,2})[\/\-.\s]+(\d{1,2})[\/\-.\s]+(\d{2,4})$/);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (br) {
    d = br[1].padStart(2, "0");
    m = br[2].padStart(2, "0");
    y = br[3].length === 2 ? `20${br[3]}` : br[3];
  } else if (iso) {
    y = iso[1];
    m = iso[2];
    d = iso[3];
  } else {
    const dig = s.replace(/\D/g, "");
    if (dig.length === 8) {
      d = dig.slice(0, 2);
      m = dig.slice(2, 4);
      y = dig.slice(4, 8);
    } else return null;
  }
  if (Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) {
    return null;
  }
  return {
    day: d,
    month: m,
    year: y,
    digits: `${d}${m}${y}`,
    pretty: `${d}/${m}/${y}`,
  };
}

function birthFieldHasDate(el) {
  const dig = String(el?.value || "").replace(/\D/g, "");
  return dig.length >= 8;
}

/** LATAM cobrança: máscara "dd / mm / aaaa" — digitar só os 8 dígitos. */
async function fillBillingBirthDate(billRoot, raw) {
  const parts = parseBillingBirth(raw);
  if (!parts) {
    console.info("[TradeMiles] Sem data de nascimento no cartão.");
    return false;
  }

  const birthEl =
    findBillingField(billRoot, ["data de nascimento"], {
      excludeWords: ["vencimento", "cartao", "cartão"],
    }) ||
    findBillingField(billRoot, ["nascimento"], {
      excludeWords: ["vencimento", "cartao", "cartão"],
    }) ||
    findByAutocomplete(document.body, ["bday"]) ||
    [...document.querySelectorAll("input")].find((el) => {
      if (!isVisible(el)) return false;
      const ph = normalizeLabel(el.placeholder || "");
      return ph.includes("dd") && ph.includes("mm") && ph.includes("aaaa");
    });

  if (!birthEl) {
    console.warn("[TradeMiles] Campo data de nascimento não encontrado.");
    return false;
  }

  realClick(birthEl);
  await sleep(80);

  // input type="date" → YYYY-MM-DD (não dd/mm)
  if (birthEl.type === "date" || /dateofbirth/i.test(birthEl.name || birthEl.id || "")) {
    const iso = `${parts.year}-${parts.month}-${parts.day}`;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    const tracker = birthEl._valueTracker;
    if (tracker) {
      try {
        tracker.setValue("");
      } catch {
        /* ignore */
      }
    }
    if (setter) setter.call(birthEl, iso);
    else birthEl.value = iso;
    birthEl.dispatchEvent(new Event("input", { bubbles: true }));
    birthEl.dispatchEvent(new Event("change", { bubbles: true }));
    birthEl.dispatchEvent(new Event("blur", { bubbles: true }));
    if (birthEl.value === iso || birthFieldHasDate(birthEl)) return true;
  }

  // Limpa máscara (campo texto)
  birthEl.focus?.();
  const proto = HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(birthEl, "");
  else birthEl.value = "";
  birthEl.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(40);

  // Digita só dígitos — máscara LATAM monta "dd / mm / aaaa"
  await typeChars(birthEl, parts.digits);
  await sleep(150);
  if (birthFieldHasDate(birthEl)) return true;

  // Fallback: valor formatado
  setNativeValue(birthEl, parts.pretty);
  await sleep(80);
  if (birthFieldHasDate(birthEl)) return true;

  setNativeValue(birthEl, `${parts.day} / ${parts.month} / ${parts.year}`);
  await sleep(80);
  if (birthFieldHasDate(birthEl)) return true;

  // Digitação lenta dígito a dígito
  if (setter) setter.call(birthEl, "");
  else birthEl.value = "";
  birthEl.dispatchEvent(new Event("input", { bubbles: true }));
  let cur = "";
  for (const ch of parts.digits) {
    cur += ch;
    const tracker = birthEl._valueTracker;
    if (tracker) {
      try {
        tracker.setValue(cur.slice(0, -1));
      } catch {
        /* ignore */
      }
    }
    if (setter) setter.call(birthEl, cur);
    else birthEl.value = cur;
    birthEl.dispatchEvent(
      new KeyboardEvent("keydown", { key: ch, bubbles: true })
    );
    birthEl.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: ch,
        inputType: "insertText",
      })
    );
    birthEl.dispatchEvent(
      new KeyboardEvent("keyup", { key: ch, bubbles: true })
    );
    await sleep(50);
  }
  birthEl.dispatchEvent(new Event("change", { bubbles: true }));
  birthEl.dispatchEvent(new Event("blur", { bubbles: true }));
  await sleep(100);

  if (birthFieldHasDate(birthEl)) return true;
  console.warn("[TradeMiles] Data de nascimento não grudou na máscara.", {
    tried: parts,
    value: birthEl.value,
  });
  return false;
}

async function fillBilling(card) {
  const billRoot =
    findSectionByHeading(/dados de cobrança|dados de cobranca/i) ||
    document.body;

  try {
    billRoot.scrollIntoView?.({ block: "center" });
  } catch {
    /* ignore */
  }
  await sleep(200);

  const { first, last } = splitHolder(card.holderName || "");

  // Nome(s) / Sobrenome(s) — NÃO tocar no "Nome e sobrenome" do cartão
  const nomeEl =
    findBillingField(billRoot, ["nomes", "nome s"], {
      excludeWords: ["sobrenome", "cartao", "cartão", "nome e sobrenome"],
    }) ||
    findBillingField(billRoot, ["nome"], {
      excludeWords: [
        "sobrenome",
        "cartao",
        "cartão",
        "nome e sobrenome",
        "usuario",
      ],
    }) ||
    findByAutocomplete(billRoot, ["given-name"]);
  const sobEl =
    findBillingField(billRoot, ["sobrenomes", "sobrenome s", "sobrenome"], {
      excludeWords: ["nome e sobrenome"],
    }) || findByAutocomplete(billRoot, ["family-name"]);

  if (first && nomeEl) await fillInput(nomeEl, first);
  if (last && sobEl) await fillInput(sobEl, last);

  await fillBillingBirthDate(billRoot, card.birthDate);

  if (card.cpf) {
    const cpfEl = findBillingField(billRoot, ["cpf"]);
    if (cpfEl) await fillInput(cpfEl, String(card.cpf).replace(/\D/g, ""));
  }

  if (card.email) {
    const emailEl =
      findBillingField(billRoot, ["email", "e-mail"]) ||
      findByAutocomplete(billRoot, ["email"]);
    if (emailEl) await fillInput(emailEl, card.email);
  }

  // LATAM NÃO completa endereço pelo CEP — preencher tudo manualmente.
  const addr = addressLine(card);
  const resolved = card.state ? resolveState(card.state) : null;

  const paisEl = findBillingField(billRoot, ["pais", "país"]);
  if (paisEl) await selectDropdown(paisEl, "Brasil");

  async function fillEstado() {
    const estadoEl =
      findBillingField(billRoot, ["estado"]) ||
      findByAutocomplete(document.body, ["address-level1"]);
    if (!estadoEl || !resolved) return false;
    return selectEstado(estadoEl, resolved);
  }

  async function fillCidade() {
    if (!card.city) return false;
    const cityEl =
      findBillingField(billRoot, ["cidade"]) ||
      findByAutocomplete(document.body, ["address-level2"]);
    return cityEl ? fillInput(cityEl, card.city) : false;
  }

  async function fillEndereco() {
    if (!addr) return false;
    const endEl =
      findBillingField(billRoot, ["endereco", "endereço"], {
        excludeWords: ["email", "e-mail"],
      }) ||
      findByAutocomplete(document.body, [
        "street-address",
        "address-line1",
      ]);
    return endEl ? fillInput(endEl, addr) : false;
  }

  async function fillComplemento() {
    if (!card.complement) return false;
    const compEl =
      findBillingField(billRoot, [
        "apartamento ou escritorio",
        "apartamento ou escritório",
        "apartamento",
        "complemento",
      ]) || findByAutocomplete(document.body, ["address-line2"]);
    return compEl ? fillInput(compEl, card.complement) : false;
  }

  async function fillCep() {
    if (!card.zip) return false;
    const zipEl =
      findBillingField(billRoot, [
        "codigo postal",
        "código postal",
        "cep",
      ]) || findByAutocomplete(document.body, ["postal-code"]);
    return zipEl
      ? fillInput(zipEl, String(card.zip).replace(/\D/g, ""))
      : false;
  }

  // Ordem estável: localização → rua → CEP (e re-preenche rua/cidade se o CEP limpar)
  await fillEstado();
  await sleep(150);
  await fillCidade();
  await fillEndereco();
  await fillComplemento();
  await fillCep();
  await sleep(400);
  // Reaplica endereço/cidade/estado — CEP da LATAM às vezes apaga ou não completa
  await fillEstado();
  await fillCidade();
  await fillEndereco();
  await fillComplemento();

  console.info("[TradeMiles] cobrança", {
    addr,
    city: card.city,
    state: resolved?.name || card.state,
    zip: card.zip,
  });
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
