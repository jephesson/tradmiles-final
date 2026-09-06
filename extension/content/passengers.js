/**
 * Passageiros LATAM — /v2/passageiros e /pagamentos/passageiros
 * - Nome / sobrenome separados (não confundir "nome" com "sobrenome")
 * - Remove acentos e caracteres especiais
 * - Data: dia, mês e ano em campos separados
 */

/**
 * soft:true — não dá focus (evita abrir "Passageiros salvos" no nome).
 */
function safeScrollIntoView(el) {
  if (!el) return;
  try {
    el.scrollIntoView?.({ block: "center", behavior: "instant" });
  } catch {
    try {
      el.scrollIntoView?.({ block: "center" });
    } catch {
      /* pattern inválido da LATAM estoura scrollIntoView — ignora */
    }
  }
}

/** LATAM coloca `pattern` inválido (Chrome /v) — remove antes de focar/digitar. */
function disarmBadPattern(el) {
  if (!el || !el.getAttribute) return;
  try {
    const pat = el.getAttribute("pattern");
    if (!pat) return;
    if (!el.dataset.tmPattern) el.dataset.tmPattern = pat;
    el.removeAttribute("pattern");
  } catch {
    /* ignore */
  }
}

/** Telefone no form pagamentos: type="email" (!), name passengerInfo.phones[0].number */
function isLatamPhoneField(el) {
  if (!el) return false;
  const blob = [
    el.name,
    el.id,
    el.getAttribute?.("data-testid"),
    el.getAttribute?.("aria-label"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    blob.includes("phones[0].number") ||
    blob.includes("phones0-number") ||
    blob.includes("passengerinfo.phones") ||
    blob.includes("número de telefone") ||
    blob.includes("numero de telefone") ||
    /telefone/.test(blob)
  );
}

function isLatamEmailField(el) {
  if (!el) return false;
  if (isLatamPhoneField(el)) return false;
  const blob = [
    el.name,
    el.id,
    el.getAttribute?.("data-testid"),
    el.getAttribute?.("aria-label"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    blob.includes("passengerinfo.emails") ||
    blob.includes("passengerinfo-emails") ||
    blob.includes("insira o email") ||
    (el.type === "email" && /email/.test(blob))
  );
}

function setNativeValue(el, value, { soft = false } = {}) {
  if (!el || value == null || value === "") return false;
  const str = String(value);
  const tag = el.tagName;
  disarmBadPattern(el);

  if (tag === "SELECT") {
    const needle = str.toLowerCase();
    const opt = Array.from(el.options || []).find((o) => {
      const t = (o.textContent || "").trim().toLowerCase();
      const v = String(o.value || "").toLowerCase();
      return t === needle || t.includes(needle) || v === needle;
    });
    if (!opt) return false;
    if (!soft) {
      try {
        el.focus?.();
      } catch {
        /* ignore */
      }
    }
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

  if (!soft) {
    try {
      el.focus?.();
    } catch {
      /* ignore */
    }
  }
  const tracker = el._valueTracker;
  if (tracker) {
    try {
      tracker.setValue(el.value || "");
    } catch {
      /* ignore */
    }
  }
  // Respeita maxLength do campo (exceto quando truncaria e-mail válido)
  let out = str;
  if (el.maxLength > 0 && out.length > el.maxLength) {
    const looksEmail = /@/.test(out) && el.type === "email";
    const isPhoneField = isLatamPhoneField(el);
    if (!(looksEmail && !isPhoneField)) {
      out = out.slice(0, el.maxLength);
    }
  }
  if (setter) setter.call(el, out);
  else el.value = out;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(
    new InputEvent("input", { bubbles: true, data: out, inputType: "insertText" })
  );
  el.dispatchEvent(new Event("change", { bubbles: true }));
  if (!soft) {
    try {
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    } catch {
      /* ignore */
    }
  }
  return true;
}

/** Nunca clicar nisto — é o que abre o popover e trava o fill. */
function isUnsafeClickTarget(el) {
  if (!el) return true;
  const t = normalizeLabel(textOf(el));
  if (!t) return false;
  if (t.includes("passageiros salvos") || t.includes("passageiro salvo")) {
    return true;
  }
  if (t.includes("preencher trademiles")) return true;
  if (t.includes("continuar com o pagamento")) return true;
  return false;
}

/** Toggle da ficha do pax (Adulto N / nome) — não o autocomplete. */
function isPassengerCardToggle(el) {
  if (!el || !isVisible(el) || isUnsafeClickTarget(el)) return false;
  const t = normalizeLabel(textOf(el));
  if (!t || t.length > 90) return false;
  if (t.includes("confirmar dados")) return false;
  if (/^(adulto|crianca|criança|bebe|bebê)\b/.test(t)) return true;
  // Cabeçalho já com nome do passageiro (após preencher)
  if (
    el.getAttribute?.("aria-expanded") != null &&
    t.length >= 4 &&
    !t.includes("salvo")
  ) {
    return true;
  }
  return false;
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

/** LATAM: só letras/espaços, sem acento nem especiais. */
function sanitizeLatamName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NAME_PARTICLES = new Set([
  "da",
  "de",
  "do",
  "das",
  "dos",
  "e",
  "di",
  "del",
  "della",
  "van",
  "von",
  "y",
]);

function isNameParticle(tok) {
  return NAME_PARTICLES.has(String(tok || "").toLowerCase());
}

/** Junta tokens; não corta no meio da palavra ao aplicar teto. */
function clampNameWords(str, max) {
  const s = sanitizeLatamName(str);
  if (!max || max < 1 || s.length <= max) return s;
  let cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  if (sp >= 3) cut = cut.slice(0, sp);
  return cut.trim();
}

/**
 * Encaixa nome/sobrenome nos limites da LATAM (maxLength do input).
 * Prefere nomes compostos no Nome (Ana Lucia, Luiz Felipe) e não separa
 * partícula (da Silva).
 */
function fitLatamNames(firstRaw, lastRaw, maxFirst = 30, maxLast = 30) {
  const mf = Math.max(1, Number(maxFirst) || 30);
  const ml = Math.max(1, Number(maxLast) || 30);

  const first = sanitizeLatamName(firstRaw);
  const last = sanitizeLatamName(lastRaw);

  let parts = [];
  if (first && last && first === last) {
    parts = first.split(/\s+/).filter(Boolean);
  } else {
    parts = [...first.split(/\s+/), ...last.split(/\s+/)].filter(Boolean);
  }

  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) {
    const only = clampNameWords(parts[0], Math.min(mf, ml));
    return { firstName: only.slice(0, mf), lastName: only.slice(0, ml) };
  }

  let best = null;
  for (let i = 1; i < parts.length; i++) {
    if (isNameParticle(parts[i - 1])) continue;
    const f = parts.slice(0, i).join(" ");
    const l = parts.slice(i).join(" ");
    if (!l) continue;
    if (f.length <= mf && l.length <= ml) {
      const score =
        f.length +
        l.length +
        (i >= 2 && i <= 3 ? 3 : 0) +
        (isNameParticle(parts[i]) ? 2 : 0);
      if (!best || score > best.score) {
        best = { firstName: f, lastName: l, score };
      }
    }
  }
  if (best) return { firstName: best.firstName, lastName: best.lastName };

  let splitAt = 1;
  for (let i = 1; i < parts.length; i++) {
    if (isNameParticle(parts[i - 1])) continue;
    const f = parts.slice(0, i).join(" ");
    if (f.length <= mf) splitAt = i;
    else break;
  }
  let firstParts = parts.slice(0, splitAt);
  let lastParts = parts.slice(splitAt);
  if (!lastParts.length) {
    lastParts = [firstParts[firstParts.length - 1]];
  }

  while (lastParts.join(" ").length > ml && lastParts.length > 1) {
    lastParts.shift();
    while (
      lastParts.length > 1 &&
      isNameParticle(lastParts[0]) &&
      lastParts.join(" ").length > ml
    ) {
      lastParts.shift();
    }
  }

  let firstName = clampNameWords(firstParts.join(" "), mf);
  let lastName = clampNameWords(lastParts.join(" "), ml);
  if (!lastName) lastName = firstName;
  if (!firstName) firstName = lastName;
  return { firstName, lastName };
}

function nameFieldLimits(root) {
  const nome = findFirstNameField(root || document.body);
  const sob = findLastNameField(root || document.body);
  return {
    maxFirst: nome && nome.maxLength > 0 ? nome.maxLength : 30,
    maxLast: sob && sob.maxLength > 0 ? sob.maxLength : 30,
    nomeEl: nome,
    sobEl: sob,
  };
}

function splitPassengerName(pax, limits = {}) {
  let first = sanitizeLatamName(pax.firstName);
  let last = sanitizeLatamName(pax.lastName);

  if (!first && last) {
    const parts = last.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first = parts[0];
      last = parts.slice(1).join(" ");
    }
  }
  if (first && !last) last = first;
  if (first && last && first === last) {
    const parts = first.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first = parts[0];
      last = parts.slice(1).join(" ");
    }
  }
  if (!first && pax.raw) {
    const line = sanitizeLatamName(
      String(pax.raw)
        .split("\n")
        .map((l) => l.trim())
        .find((l) => /[A-Za-z]{2,}/.test(l) && !/\d{3}/.test(l)) || ""
    );
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first = parts[0];
      last = parts.slice(1).join(" ");
    }
  }

  const maxFirst = limits.maxFirst > 0 ? limits.maxFirst : 30;
  const maxLast = limits.maxLast > 0 ? limits.maxLast : 30;
  const fitted = fitLatamNames(first, last, maxFirst, maxLast);
  if (fitted.firstName !== first || fitted.lastName !== last) {
    console.info("[TradeMiles] nome ajustado ao limite", {
      maxFirst,
      maxLast,
      from: { first, last },
      to: fitted,
    });
  }
  return fitted;
}

function expandBirthYear(y) {
  const s = String(y || "").replace(/\D/g, "");
  if (s.length === 4) return s;
  if (s.length === 2) {
    const n = Number(s);
    // 00–30 → 2000–2030 (criança); 31–99 → 1931–1999
    return `${n <= 30 ? "20" : "19"}${s.padStart(2, "0")}`;
  }
  return s;
}

function birthParts(pax) {
  let d;
  let m;
  let y;
  if (pax.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(pax.birthDate)) {
    [y, m, d] = pax.birthDate.split("-");
  } else if (pax.birthDateBR) {
    const parts = String(pax.birthDateBR).split(/[\/\-.\s]+/);
    if (parts.length >= 3) [d, m, y] = parts;
  } else if (pax.birthDateLatam) {
    const parts = String(pax.birthDateLatam).split(/[\/\-.\s]+/);
    if (parts.length >= 3) [d, m, y] = parts;
  }
  if (!d || !m || !y) return null;
  const year = expandBirthYear(y);
  if (year.length !== 4) return null;
  const day = String(Number(d)).padStart(2, "0");
  const month = String(Number(m)).padStart(2, "0");
  const dd = Number(day);
  const mm = Number(month);
  if (!dd || !mm || dd > 31 || mm > 12) return null;
  return { day, month, year };
}

function isVisible(el) {
  if (!el) return false;
  // NÃO usar getComputedStyle: o e-mail da LATAM tem `pattern` inválido (flag /v)
  // e o Chrome estoura ao ler display/rect nesse input.
  try {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.top > (window.innerHeight || 800) + 50) return false;
    return true;
  } catch {
    // pattern inválido: getBoundingClientRect estoura — para inputs de formulário
    // assume visível (senão o bloco de contato inteiro some da busca).
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON";
  }
}

/** Tem tamanho no layout (pode estar abaixo da dobra — Confirmar dados). */
function hasLayoutSize(el) {
  if (!el) return false;
  try {
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  } catch {
    const tag = el.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      tag === "BUTTON"
    );
  }
}

function ownFieldLabel(el) {
  if (!el) return "";
  return normalizeLabel(
    [
      el.getAttribute("aria-label"),
      el.getAttribute("name"),
      el.getAttribute("placeholder"),
      el.getAttribute("id"),
      el.getAttribute("data-testid"),
      el.getAttribute("autocomplete"),
      el.labels?.[0] ? textOf(el.labels[0]) : "",
    ]
      .filter(Boolean)
      .join(" ")
  );
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
    const prev = p.previousElementSibling;
    if (prev && /label|span|p|div/i.test(prev.tagName)) bits.push(textOf(prev));
    p = p.parentElement;
  }
  return normalizeLabel(bits.filter(Boolean).join(" | "));
}

function visibleTextInputs(root) {
  return [
    ...root.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])"
    ),
  ].filter(isVisible);
}

/** Match por rótulo com palavra inteira — evita "nome" ⊆ "sobrenome". */
function findFieldByWord(root, words, { excludeWords = [] } = {}) {
  const needles = (Array.isArray(words) ? words : [words]).map(normalizeLabel);
  const excludes = excludeWords.map(normalizeLabel);
  const inputs = [
    ...root.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea"
    ),
  ].filter(isVisible);

  for (const el of inputs) {
    const meta = fieldMeta(el);
    if (excludes.some((ex) => meta.includes(ex))) continue;
    const ok = needles.some((n) => {
      const re = new RegExp(`(^|[^a-z])${n.replace(/\s+/g, "\\s+")}([^a-z]|$)`);
      return re.test(meta);
    });
    if (ok) return el;
  }
  return null;
}

function findFirstNameField(root) {
  return (
    findFieldByWord(root, ["nome"], {
      excludeWords: ["sobrenome", "nome e sobrenome", "passageiro frequente"],
    }) ||
    [...root.querySelectorAll('input[autocomplete="given-name"]')].find(isVisible) ||
    null
  );
}

function findLastNameField(root) {
  return (
    findFieldByWord(root, ["sobrenome"]) ||
    [...root.querySelectorAll('input[autocomplete="family-name"]')].find(isVisible) ||
    null
  );
}

function findDateOfBirthInput(root) {
  const scope = root || document.body;
  const byTestId = [
    ...scope.querySelectorAll(
      'input[type="date"][name*="dateOfBirth" i], input[type="date"][data-testid*="dateOfBirth" i], input[data-testid*="dateOfBirth" i], input[name*="dateOfBirth" i]'
    ),
  ].find(isVisible);
  if (byTestId) return byTestId;

  // Máscara visual LATAM: placeholder "dd / mm / aaaa"
  const byPlaceholder = [...scope.querySelectorAll("input")].find((el) => {
    if (!isVisible(el)) return false;
    const ph = normalizeLabel(el.placeholder || "");
    return (
      ph.includes("dd") &&
      ph.includes("mm") &&
      (ph.includes("aaaa") || ph.includes("yyyy"))
    );
  });
  if (byPlaceholder) return byPlaceholder;

  const byType = [...scope.querySelectorAll('input[type="date"]')].find((el) => {
    if (!isVisible(el)) return false;
    const meta = fieldMeta(el);
    return (
      meta.includes("nascimento") ||
      meta.includes("dateofbirth") ||
      meta.includes("birth")
    );
  });
  if (byType) return byType;

  return (
    findFieldByWord(scope, ["data de nascimento", "nascimento"], {
      excludeWords: ["vencimento"],
    }) || null
  );
}

function birthFieldHasDate(el) {
  if (!el) return false;
  const v = String(el.value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
  return v.replace(/\D/g, "").length >= 8;
}

async function clearInputHard(el) {
  if (!el) return;
  el.focus?.();
  const proto = HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  const tracker = el._valueTracker;
  if (tracker) {
    try {
      tracker.setValue(el.value || "x");
    } catch {
      /* ignore */
    }
  }
  if (setter) setter.call(el, "");
  else el.value = "";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  try {
    el.select?.();
    document.execCommand?.("delete");
  } catch {
    /* ignore */
  }
}

/** Digita caractere a caractere (máscaras React da LATAM: dd / mm / aaaa). */
async function typeChars(el, value, { clear = true, delay = 40 } = {}) {
  if (!el || value == null || value === "") return false;
  const str = String(value);
  disarmBadPattern(el);
  safeScrollIntoView(el);
  try {
    el.focus?.();
  } catch {
    /* ignore */
  }
  try {
    el.click?.();
  } catch {
    /* ignore */
  }
  await sleep(30);
  try {
    if (document.activeElement !== el) el.focus?.();
  } catch {
    /* ignore */
  }

  if (clear) {
    await clearInputHard(el);
    await sleep(40);
    try {
      el.focus?.();
    } catch {
      /* ignore */
    }
  }

  const proto = HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

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
    await sleep(delay);
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

/** input[type=date] exige YYYY-MM-DD. */
/** type=date LATAM: só YYYY-MM-DD. Sem click (calendário) nem valueAsDate UTC. */
function fillNativeDateInput(el, parts) {
  if (!el || !parts) return false;
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  const min = el.getAttribute("min");
  const max = el.getAttribute("max");
  if (min && iso < min) {
    console.warn("[TradeMiles] Nascimento abaixo do min LATAM:", iso, min);
  }
  if (max && iso > max) {
    console.warn("[TradeMiles] Nascimento acima do max LATAM:", iso, max);
  }

  const tracker = el._valueTracker;
  if (tracker) {
    try {
      tracker.setValue(el.value || "");
    } catch {
      /* ignore */
    }
  }
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  if (setter) setter.call(el, iso);
  else el.value = iso;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: iso,
      inputType: "insertFromPaste",
    })
  );
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return el.value === iso;
}

/** Layout antigo: dia / mês / ano separados. */
function fillBirthSplitFields(root, parts) {
  let container = root;
  const labels = [...root.querySelectorAll("label, span, p, div, legend")];
  for (const lab of labels) {
    const t = normalizeLabel(textOf(lab));
    if (t.includes("data de nascimento") || t === "nascimento") {
      let cur = lab.parentElement;
      for (let i = 0; i < 6 && cur; i++) {
        const ins = visibleTextInputs(cur);
        if (ins.length >= 3 && ins.length <= 8) {
          container = cur;
          break;
        }
        cur = cur.parentElement;
      }
      break;
    }
  }

  const inputs = visibleTextInputs(container).filter((i) => i.type !== "date");
  const dayEl =
    findFieldByWord(container, ["dia"]) ||
    inputs.find((i) => /^(dd|dia)$/i.test((i.placeholder || "").trim())) ||
    inputs.find((i) => i.maxLength === 2 && /day|dia|dd/i.test(fieldMeta(i)));
  const monthEl =
    findFieldByWord(container, ["mes", "mês"]) ||
    inputs.find((i) => /^(mm|mes|mês)$/i.test((i.placeholder || "").trim())) ||
    inputs.find((i) => i.maxLength === 2 && /month|mes|mm/i.test(fieldMeta(i)));
  const yearEl =
    findFieldByWord(container, ["ano", "aaaa", "yyyy"]) ||
    inputs.find((i) => /^(aaaa|yyyy|aa|ano)$/i.test((i.placeholder || "").trim())) ||
    inputs.find((i) => i.maxLength === 4);

  let n = 0;
  if (dayEl && monthEl && yearEl) {
    if (setNativeValue(dayEl, parts.day)) n++;
    if (setNativeValue(monthEl, parts.month)) n++;
    if (setNativeValue(yearEl, parts.year)) n++;
    return n;
  }

  const shorties = inputs.filter(
    (i) =>
      i.maxLength === 2 ||
      i.maxLength === 4 ||
      /dd|mm|aa|ano|dia|mes/i.test(i.placeholder || "") ||
      i.inputMode === "numeric"
  );
  if (shorties.length >= 3) {
    shorties.sort(
      (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left
    );
    const d = shorties.find((i) => i.maxLength === 2) || shorties[0];
    const rest = shorties.filter((i) => i !== d);
    const m = rest.find((i) => i.maxLength === 2) || rest[0];
    const y =
      rest.find((i) => i !== m && (i.maxLength === 4 || i.maxLength === 2)) ||
      rest[1];
    if (setNativeValue(d, parts.day)) n++;
    if (setNativeValue(m, parts.month)) n++;
    if (
      y &&
      setNativeValue(
        y,
        parts.year.length === 4 && y.maxLength === 2
          ? parts.year.slice(-2)
          : parts.year
      )
    ) {
      n++;
    }
  }
  return n;
}

function findPassengerDobInput(passengerIndex, root) {
  if (
    getPassengerFormKind() === "confirm" &&
    passengerIndex != null &&
    passengerIndex >= 0
  ) {
    const adt = findConfirmAdtField(passengerIndex + 1, "dob");
    if (adt) return adt;
  }

  let el = null;
  if (passengerIndex != null && passengerIndex >= 0) {
    el =
      document.querySelector(
        `input[name="passenger-${passengerIndex}_dateOfBirth"]`
      ) ||
      document.querySelector(
        `input[data-testid*="passenger-${passengerIndex}_dateOfBirth" i]`
      ) ||
      document.querySelector(
        `input[id*="passenger-${passengerIndex}"][id*="dateOfBirth" i]`
      ) ||
      document.querySelector(
        `input[name*="passenger-${passengerIndex}"][name*="Birth" i]`
      );
  }
  if (el) return el;
  return findDateOfBirthInput(root || document.body);
}

/**
 * Data de nascimento LATAM (placeholder "dd / mm / aaaa"):
 * digitar 8 dígitos; type=date → YYYY-MM-DD.
 * opts.expand=false no formulário com "Confirmar dados" (evita loop abrir/fechar).
 */
async function fillBirthDate(root, pax, passengerIndex, opts = {}) {
  const expand = opts.expand !== false;
  const parts = birthParts(pax);
  if (!parts) {
    console.warn("[TradeMiles] Pax sem data de nascimento no payload", pax);
    return 0;
  }

  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  const digits = `${parts.day}${parts.month}${parts.year}`;
  const pretty = `${parts.day}/${parts.month}/${parts.year}`;
  const spaced = `${parts.day} / ${parts.month} / ${parts.year}`;

  if (expand && passengerIndex != null && passengerIndex >= 0) {
    await ensurePassengerExpanded(passengerIndex);
    await sleep(200);
  }

  let el = findPassengerDobInput(passengerIndex, root);
  if (el && !isVisible(el) && expand && passengerIndex != null) {
    await ensurePassengerExpanded(passengerIndex);
    await sleep(350);
    el = findPassengerDobInput(passengerIndex, root);
  }
  // Com índice: usa o input pelo name mesmo fora da viewport
  if (!el && (passengerIndex == null || passengerIndex < 0)) {
    el = findDateOfBirthInput(root || document.body);
  } else if (el && !isVisible(el) && (passengerIndex == null || passengerIndex < 0)) {
    el = findDateOfBirthInput(root || document.body);
  }

  if (!el) {
    const split = fillBirthSplitFields(root || document.body, parts);
    return split > 0 ? split : 0;
  }

  if (birthFieldHasDate(el)) {
    const cur = String(el.value || "").replace(/\D/g, "");
    if (cur === digits || el.value === iso) return 1;
  }

  try {
    el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  } catch {
    el.scrollIntoView?.({ block: "center", inline: "nearest" });
  }
  await sleep(120);

  // v2 LATAM: type="date" → só ISO. Digitar dígitos APAGA o campo.
  if (el.type === "date") {
    fillNativeDateInput(el, parts);
    await sleep(80);
    if (el.value !== iso) fillNativeDateInput(el, parts);
    await sleep(80);
    return el.value === iso || birthFieldHasDate(el) ? 1 : 0;
  }

  // Máscara texto (formulário antigo / pagamentos)
  await typeChars(el, digits, { clear: true, delay: 45 });
  await sleep(160);
  if (birthFieldHasDate(el)) return 1;

  await typeChars(el, digits, { clear: true, delay: 70 });
  await sleep(160);
  if (birthFieldHasDate(el)) return 1;

  const dashed = `${parts.day}-${parts.month}-${parts.year}`;
  await typeChars(el, dashed, { clear: true, delay: 35 });
  await sleep(120);
  if (birthFieldHasDate(el)) return 1;

  await typeChars(el, spaced, { clear: true, delay: 35 });
  await sleep(120);
  if (birthFieldHasDate(el)) return 1;

  setNativeValue(el, pretty);
  await sleep(80);
  if (birthFieldHasDate(el)) return 1;

  console.warn("[TradeMiles] Data de nascimento não grudou:", {
    value: el.value,
    type: el.type,
    name: el.name,
    iso,
  });
  return 0;
}

/** Heurística pelo 1º nome (igual ao parse do TradeMiles). */
function guessGenderFromName(name) {
  const first = sanitizeLatamName(name).split(/\s+/)[0]?.toLowerCase() || "";
  if (!first) return null;
  const male = new Set([
    "jose",
    "jorge",
    "andre",
    "lucas",
    "matheus",
    "mateus",
    "nicolas",
    "nicholas",
    "luca",
    "noah",
    "davi",
    "david",
    "gabriel",
    "rafael",
    "miguel",
    "samuel",
    "daniel",
    "henrique",
    "felipe",
    "guilherme",
    "alexandre",
    "kaique",
    "caique",
    "isaac",
    "isac",
    "moises",
    "juan",
    "luan",
    "bryan",
    "ryan",
    "ian",
    "enzo",
    "lorenzo",
    "theo",
    "heitor",
    "arthur",
    "artur",
    "victor",
    "vitor",
    "pedro",
    "paulo",
    "carlos",
    "marcos",
    "luis",
    "luiz",
    "bruno",
    "diego",
    "tiago",
    "thiago",
    "igor",
    "kevin",
    "erick",
    "eric",
    "joao",
    "wellington",
    "washington",
  ]);
  const female = new Set([
    "alice",
    "beatriz",
    "raquel",
    "isabel",
    "isabelle",
    "carmen",
    "ingrid",
    "lais",
    "nicole",
    "michele",
    "michelle",
    "irene",
    "ivone",
    "elis",
    "heloise",
    "louise",
    "jennifer",
    "kelly",
    "yasmin",
    "iasmin",
    "milene",
    "gisele",
    "giselle",
    "sheila",
    "debora",
    "deborah",
    "thamyres",
    "thamires",
    "odete",
    "ester",
    "esther",
    "ruth",
    "rayssa",
    "raissa",
    "laura",
    "flavia",
    "katia",
    "cathia",
    "cassia",
    "lucia",
    "luciana",
    "patricia",
    "jessica",
    "leticia",
  ]);
  if (female.has(first)) return "F";
  if (male.has(first)) return "M";
  if (first.endsWith("a")) return "F";
  if (first.endsWith("o")) return "M";
  return null;
}

/**
 * Autocomplete flutuante "Passageiros salvos" — NÃO o título da seção na página.
 * O título fixo da LATAM batia no detector antigo → Escape → 2º pax em branco.
 */
function isSavedPassengersPopoverOpen() {
  return Array.from(
    document.querySelectorAll("h1, h2, h3, h4, h5, h6, p, span, label, div")
  ).some((el) => {
    if (!isVisible(el)) return false;
    const t = normalizeLabel(textOf(el));
    if (t !== "passageiros salvos" && t !== "passageiro salvo") return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.width >= 420 || r.height >= 80) return false;
    // Só conta se estiver num overlay/lista (não no formulário principal)
    if (
      el.closest?.(
        '[role="listbox"], [role="dialog"], [class*="autocomplete" i], [data-testid*="autocomplete" i], [class*="popover" i], [class*="dropdown" i]'
      )
    ) {
      return true;
    }
    const pos = (() => {
      try {
        return window.getComputedStyle(el).position;
      } catch {
        return "";
      }
    })();
    return pos === "fixed" || pos === "absolute";
  });
}

/** Escape leve — usar com cuidado (na LATAM derruba o acordeão). */
function closeOpenMenus() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    })
  );
}

/** Fecha só o autocomplete flutuante — preferir blur; Escape só se listbox visível. */
async function dismissSavedPassengersPopover() {
  if (!isSavedPassengersPopoverOpen()) return false;
  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    active.blur?.();
  }
  await sleep(80);
  const listbox = Array.from(
    document.querySelectorAll('[role="listbox"]')
  ).find(isVisible);
  if (listbox && isSavedPassengersPopoverOpen()) {
    closeOpenMenus();
    await sleep(80);
  }
  return true;
}

function pageStillHasPassengerForm() {
  return (
    visibleTextInputs(document.body).length >= 2 ||
    Boolean(findConfirmDadosButton(document)) ||
    Boolean(findDateOfBirthInput(document.body)) ||
    /adulto\s*\d/i.test(document.body?.innerText || "")
  );
}

async function waitForPassengerFormReady({ timeoutMs = 20000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const kind = getPassengerFormKind();
    const root = currentPassengerFormRoot();
    const inputs = visibleTextInputs(root);
    const hasName =
      Boolean(document.querySelector(`input[name="passenger-0_firstName"]`)) ||
      Boolean(document.querySelector('input[name="passengerDetails.firstName"]')) ||
      Boolean(document.querySelector('input[name="passengerInfo.firstName"]')) ||
      Boolean(document.querySelector('input[id*="passengerDetails-firstName" i]')) ||
      Boolean(document.querySelector('input[name*="firstName" i]')) ||
      Boolean(findFirstNameField(root)) ||
      Boolean(findConfirmNameInput("first"));
    const hasDob =
      Boolean(findDateOfBirthInput(root)) ||
      Boolean(document.querySelector('input[id*="dateOfBirth" i]')) ||
      Boolean(document.querySelector('input[name*="dateOfBirth" i]'));
    // Confirmar pode estar ABAIXO da dobra — isVisible falha e travava o fill inteiro
    const hasConfirmInDom = Boolean(
      findConfirmDadosButton(document) ||
        [...document.querySelectorAll("span.MuiButton-label, button")].some(
          (el) => {
            const t = normalizeLabel(textOf(el));
            return t === "confirmar dados" || t.startsWith("confirmar dados");
          }
        )
    );
    // /pagamentos: nome/data bastam para começar (não esperar Confirmar na viewport)
    if (
      inputs.length >= 2 &&
      (hasName || hasDob) &&
      (kind === "confirm" || kind === "accordion" || hasConfirmInDom)
    ) {
      return true;
    }
    await sleep(400);
  }
  return false;
}

function genderMuiDisplayText(el) {
  if (!el) return "";
  const root =
    el.closest?.(".MuiSelect-root, .MuiInputBase-root, .MuiFormControl-root") ||
    el.parentElement;
  const display =
    root?.querySelector?.(".MuiSelect-select") ||
    root?.querySelector?.('[role="button"][aria-haspopup="listbox"]');
  return display ? textOf(display) : "";
}

/** Superfície clicável do MUI Select (input nativo costuma ter size 0). */
function genderOpenTarget(el) {
  if (!el) return null;
  const root =
    el.closest?.(".MuiSelect-root, .MuiInputBase-root, .MuiFormControl-root") ||
    el.parentElement;
  return (
    root?.querySelector?.(".MuiSelect-select") ||
    root?.querySelector?.('[role="button"][aria-haspopup="listbox"]') ||
    root?.querySelector?.('[aria-haspopup="listbox"]') ||
    el
  );
}

function genderFieldShows(el, gender) {
  if (!el || !gender) return false;
  const want = gender === "F" ? "feminino" : "masculino";
  const dataWant = gender === "F" ? "female" : "male";
  // Preferir value do input (MALE/FEMALE) — evita falso positivo pelo rótulo "Sexo"
  const rawVal = String(el.value || "").trim().toLowerCase();
  if (rawVal) {
    if (
      rawVal.includes(want) ||
      rawVal === dataWant ||
      rawVal === gender.toLowerCase()
    )
      return true;
    if (gender === "F" && (rawVal === "f" || rawVal === "female")) return true;
    if (gender === "M" && (rawVal === "m" || rawVal === "male")) return true;
    if (
      rawVal === "male" ||
      rawVal === "female" ||
      rawVal === "masculino" ||
      rawVal === "feminino" ||
      rawVal === "m" ||
      rawVal === "f"
    ) {
      return false;
    }
  }
  const t = normalizeLabel(
    textOf(el) || el.getAttribute?.("aria-label") || genderMuiDisplayText(el)
  );
  if (!t) return false;
  if (t === want || t.startsWith(want + " ") || t.includes(want)) return true;
  if (gender === "F" && (t === "f" || t === "female")) return true;
  if (gender === "M" && (t === "m" || t === "male")) return true;
  return false;
}

function findGenderOption(gender) {
  const dataValue = gender === "F" ? "FEMALE" : "MALE";
  const label = gender === "F" ? "Feminino" : "Masculino";
  const want = normalizeLabel(label);

  const byData = Array.from(
    document.querySelectorAll(
      `li[role="option"][data-value="${dataValue}"], [role="option"][data-value="${dataValue}"], li.MuiMenuItem-root[data-value="${dataValue}"]`
    )
  ).find((o) => hasLayoutSize(o));
  if (byData) return byData;

  return Array.from(
    document.querySelectorAll(
      'li.MuiMenuItem-root[role="option"], [role="listbox"] [role="option"], [role="option"], [role="menuitem"]'
    )
  ).find((o) => {
    if (!hasLayoutSize(o)) return false;
    const t = normalizeLabel(textOf(o));
    return t === want || t.startsWith(want + " ");
  });
}

/**
 * Clica via React fiber no mundo MAIN (page-hooks.js).
 * No content script isolado __reactFiber não existe — click DOM não gruda.
 */
function reactClickInPage(el) {
  if (!el) return Promise.resolve(false);
  const mark = `tm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  el.setAttribute("data-tm-pick", mark);
  const selector = `[data-tm-pick="${mark}"]`;
  const id = mark;
  return new Promise((resolve) => {
    const onMsg = (ev) => {
      const data = ev.data;
      if (
        !data ||
        data.source !== "trademiles-page" ||
        data.type !== "react-click-done" ||
        data.id !== id
      ) {
        return;
      }
      window.removeEventListener("message", onMsg);
      el.removeAttribute("data-tm-pick");
      resolve(!!data.ok);
    };
    window.addEventListener("message", onMsg);
    window.postMessage(
      { source: "trademiles", type: "react-click", id, selector },
      "*"
    );
    setTimeout(() => {
      window.removeEventListener("message", onMsg);
      el.removeAttribute("data-tm-pick");
      resolve(false);
    }, 800);
  });
}

/** Seta value no mundo MAIN (controlled inputs React da LATAM). */
function reactSetValueInPage(el, value) {
  if (!el) return Promise.resolve(false);
  const mark = `tm-val-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  el.setAttribute("data-tm-pick", mark);
  const selector = `[data-tm-pick="${mark}"]`;
  const id = mark;
  return new Promise((resolve) => {
    const onMsg = (ev) => {
      const data = ev.data;
      if (
        !data ||
        data.source !== "trademiles-page" ||
        data.type !== "react-set-value-done" ||
        data.id !== id
      ) {
        return;
      }
      window.removeEventListener("message", onMsg);
      el.removeAttribute("data-tm-pick");
      resolve(!!data.ok);
    };
    window.addEventListener("message", onMsg);
    window.postMessage(
      {
        source: "trademiles",
        type: "react-set-value",
        id,
        selector,
        value: String(value ?? ""),
      },
      "*"
    );
    setTimeout(() => {
      window.removeEventListener("message", onMsg);
      el.removeAttribute("data-tm-pick");
      resolve(false);
    }, 800);
  });
}

async function selectGender(root, gender, passengerIndex) {
  if (!gender) return false;
  const label = gender === "F" ? "Feminino" : "Masculino";
  const side = gender === "F" ? "female" : "male";
  let el = null;

  if (
    getPassengerFormKind() === "confirm" &&
    passengerIndex != null &&
    passengerIndex >= 0
  ) {
    el = findConfirmAdtField(passengerIndex + 1, "gender");
  }
  if (passengerIndex != null && passengerIndex >= 0 && !el) {
    const i = passengerIndex;
    // NÃO usar [data-testid*="gender"] solto — pega listitem male/female
    el =
      document.querySelector(`input[name="passenger-${i}_gender"]`) ||
      document.querySelector(
        `input[data-testid="passenger-${i}_gender--select__trigger--text-field"]`
      ) ||
      document.querySelector(
        `input[data-testid*="passenger-${i}_gender--select__trigger" i]`
      ) ||
      document.querySelector(`select[name="passenger-${i}_gender"]`) ||
      document.querySelector(
        `input[data-testid*="passenger-${i}_gender"][data-testid*="trigger" i]`
      );
  }

  // Formulário antigo /pagamentos: MUI Select — input escondido (size 0),
  // isVisible falha e findFieldByWord nem encontra → "nem tenta clicar"
  if (!el) {
    const scope = root && root.querySelectorAll ? root : document;
    el =
      scope.querySelector?.('input[name="passengerInfo.gender"]') ||
      scope.querySelector?.('input[id*="passengerInfo-gender" i]') ||
      document.querySelector('input[name="passengerInfo.gender"]') ||
      document.querySelector('input[id*="passengerInfo-gender" i]');
  }
  if (!el) el = findFieldByWord(root || document.body, ["sexo"]);
  if (!el) {
    console.warn("[TradeMiles] Campo Sexo não encontrado");
    return false;
  }

  if (genderFieldShows(el, gender)) {
    console.info("[TradeMiles] Sexo já OK:", el.value || genderMuiDisplayText(el));
    return true;
  }

  console.info("[TradeMiles] Selecionando sexo →", label, {
    name: el.name,
    id: el.id,
    value: el.value,
  });

  if (el.tagName === "SELECT") {
    const ok =
      setNativeValue(el, label) ||
      setNativeValue(el, gender === "F" ? "FEMALE" : "MALE") ||
      setNativeValue(el, gender === "F" ? "F" : "M");
    return ok && genderFieldShows(el, gender);
  }

  const openEl = genderOpenTarget(el);
  safeScrollIntoView(openEl || el);
  await sleep(120);
  if (openEl) {
    await reactClickInPage(openEl);
    openEl.click?.();
  } else {
    await reactClickInPage(el);
    el.focus?.();
    el.click?.();
  }
  await sleep(400);

  let hit = null;
  for (let attempt = 0; attempt < 8 && !hit; attempt++) {
    if (passengerIndex != null && passengerIndex >= 0) {
      const i = passengerIndex;
      hit =
        Array.from(
          document.querySelectorAll(
            `[data-testid="passenger-${i}_gender-${side}--autocomplete__listitem"]`
          )
        ).find((o) => hasLayoutSize(o)) ||
        Array.from(
          document.querySelectorAll(
            `[data-testid*="passenger-${i}_gender-${side}" i][role="option"]`
          )
        ).find((o) => hasLayoutSize(o));
      if (!hit) {
        const nested = Array.from(
          document.querySelectorAll(
            `[data-testid*="passenger-${i}_gender-${side}" i]`
          )
        ).find((o) => hasLayoutSize(o));
        if (nested) {
          hit =
            nested.closest?.(
              '[role="option"], [role="menuitem"], li, [data-testid*="listitem"]'
            ) || nested;
        }
      }
    }
    if (!hit) hit = findGenderOption(gender);
    if (!hit) {
      if (attempt === 2 || attempt === 5) {
        const again = genderOpenTarget(el);
        if (again) {
          await reactClickInPage(again);
          again.click?.();
        }
      }
      await sleep(150);
    }
  }

  if (hit) {
    console.info(
      "[TradeMiles] Clique opção sexo:",
      hit.getAttribute("data-value") || textOf(hit)
    );
    const ok = await reactClickInPage(hit);
    if (!ok) {
      hit.dispatchEvent?.(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window })
      );
      hit.dispatchEvent?.(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window })
      );
      hit.click?.();
    }
    await sleep(280);
  } else {
    console.warn("[TradeMiles] Opção de sexo não apareceu no menu");
  }

  // Sem Escape — na LATAM isso já derrubou o acordeão
  if (!genderFieldShows(el, gender)) {
    const code = gender === "F" ? "FEMALE" : "MALE";
    await reactSetValueInPage(el, code);
    setNativeValue(el, code, { soft: false });
    await sleep(120);
  }
  return genderFieldShows(el, gender);
}

/**
 * LATAM v2: campos `passenger-0_*`, `passenger-1_*` …
 * Funciona mesmo com acordeão fechado.
 */
function findPassengerSections(expectedCount) {
  const byIndex = [];
  const maxScan = Math.max(expectedCount || 0, 8);

  for (let i = 0; i < maxScan; i++) {
    const marker = document.querySelector(
      `input[name="passenger-${i}_dateOfBirth"], ` +
        `input[name^="passenger-${i}_"], ` +
        `[data-testid*="passenger-${i}_" i], ` +
        `[id*="passenger-${i}_" i]`
    );
    if (!marker && i >= (expectedCount || 1)) break;
    if (!marker) continue;

    let root = marker.closest?.(
      "section, article, li, [data-testid*='passenger' i], form, div"
    );
    // Sobe até o card do passageiro (sem pegar o form inteiro)
    for (let up = 0; up < 8 && root && root !== document.body; up++) {
      const hasOwn = root.querySelector?.(
        `input[name^="passenger-${i}_"], [data-testid*="passenger-${i}_" i]`
      );
      const hasNext = root.querySelector?.(
        `input[name^="passenger-${i + 1}_"], [data-testid*="passenger-${i + 1}_" i]`
      );
      if (hasOwn && !hasNext) break;
      if (hasOwn && hasNext && root.parentElement) {
        // root contém dois pax — desce um nível via parent do marker
        root = marker.closest?.(
          `[data-testid*="passenger-${i}" i], [id*="passenger-${i}" i]`
        ) || marker.parentElement;
        break;
      }
      root = root.parentElement;
    }
    if (!root || root === document.body) {
      root = marker.parentElement || document.body;
    }

    // Cabeçalho da ficha — nunca "Passageiros salvos"
    let header = findAccordionHeaderForPassenger(i);

    byIndex.push({
      kind: "adult",
      root,
      header,
      title: header ? textOf(header) : `passenger-${i}`,
      index: i,
    });
  }

  if (byIndex.length) return byIndex;

  // Fallback legado: cabeçalhos Adulto N
  const found = [];
  const seen = new Set();
  for (const el of document.querySelectorAll(
    "button, [role='button'], [aria-expanded], h2, h3, h4"
  )) {
    const t = textOf(el);
    if (!/^(Adulto|Criança|Crianca|Bebê|Bebe)\b/i.test(t) || t.length > 40) {
      continue;
    }
    if (seen.has(el)) continue;
    seen.add(el);
    found.push({
      kind: /crianca|criança/i.test(t)
        ? "child"
        : /beb/i.test(t)
          ? "infant"
          : "adult",
      root: el.parentElement || document.body,
      header: el,
      title: t,
      index: found.length,
    });
  }
  found.sort(
    (a, b) =>
      a.header.getBoundingClientRect().top -
      b.header.getBoundingClientRect().top
  );
  if (!found.length) {
    found.push({
      kind: "adult",
      root: document.body,
      header: null,
      title: "",
      index: 0,
    });
  }
  return found;
}

/**
 * Depois do preenchimento o título vira o nome (ex.: "Katia…") e deixa de
 * ser "Adulto 1". Por isso NÃO buscamos por /^Adulto/ — achamos o cabeçalho
 * a partir do input passenger-N_*.
 */
function findAccordionHeaderForPassenger(idx) {
  const marker = document.querySelector(
    `input[name="passenger-${idx}_dateOfBirth"], ` +
      `input[name="passenger-${idx}_firstName"], ` +
      `input[name^="passenger-${idx}_"]`
  );
  if (!marker) return null;

  // Adulto N pelo NÚMERO (não adultBtns[idx] — depois do fill o 1º vira nome)
  const wantOrder = idx + 1;
  const byNumber = Array.from(
    document.querySelectorAll(
      "button[aria-expanded], [role='button'][aria-expanded]"
    )
  ).find((b) => {
    if (!isPassengerCardToggle(b)) return false;
    const m = textOf(b).match(
      /^(Adulto|Criança|Crianca|Bebê|Bebe)\s*(\d+)\b/i
    );
    return m && Number(m[2]) === wantOrder;
  });
  if (byNumber) return byNumber;

  // Sobe o DOM a partir do input passenger-N_*
  let best = null;
  let node = marker.parentElement;
  for (let up = 0; up < 16 && node && node !== document.body; up++) {
    const buttons = [
      ...node.querySelectorAll(
        "button[aria-expanded], [role='button'][aria-expanded]"
      ),
    ].filter(isPassengerCardToggle);
    for (const b of buttons) {
      const pos = b.compareDocumentPosition(marker);
      if (
        pos & Node.DOCUMENT_POSITION_FOLLOWING ||
        pos & Node.DOCUMENT_POSITION_CONTAINED_BY
      ) {
        best = b;
      }
    }
    if (
      node.matches?.(
        "button[aria-expanded], [role='button'][aria-expanded]"
      ) &&
      isPassengerCardToggle(node)
    ) {
      best = node;
    }
    node = node.parentElement;
  }
  return best;
}

function passengerFieldsVisible(idx) {
  const el =
    document.querySelector(`input[name="passenger-${idx}_dateOfBirth"]`) ||
    document.querySelector(`input[name="passenger-${idx}_firstName"]`);
  return Boolean(el && isVisible(el));
}

/** Seta do acordeão LATAM (chevron SVG). */
function hasLatamExpandChevron(el) {
  if (!el) return false;
  return Boolean(
    el.querySelector?.(
      'path[d*="19.3599"], path[d*="24.2249"], path[d*="27.5509"]'
    )
  );
}

/**
 * Abre ficha do pax N.
 * LATAM: data-testid="accordion-passenger-ADT_{n}-accordion-trigger"
 * Texto: "Adulto" (1º) / "Adulto 2" / "Adulto 3" / …
 */
function findPassengerExpandToggle(idx) {
  const adt = idx + 1;
  const byTestId =
    document.querySelector(
      `[data-testid="accordion-passenger-ADT_${adt}-accordion-trigger"]`
    ) ||
    document.querySelector(
      `button[data-testid*="accordion-passenger-ADT_${adt}" i]`
    );
  if (byTestId && isVisible(byTestId)) return byTestId;

  const wantOrder = adt;
  // 1º pax: botão só "Adulto" (sem número). 2º+: "Adulto 2"
  const byLabel = Array.from(
    document.querySelectorAll("button, [role='button']")
  ).find((b) => {
    if (!isVisible(b) || isUnsafeClickTarget(b)) return false;
    const t = textOf(b).replace(/\s+/g, " ").trim();
    if (wantOrder === 1) {
      return /^(Adulto|Criança|Crianca|Bebê|Bebe)$/i.test(t);
    }
    const m = t.match(/^(Adulto|Criança|Crianca|Bebê|Bebe)\s*(\d+)\b/i);
    return m && Number(m[2]) === wantOrder;
  });
  if (byLabel) return byLabel;

  const header = findAccordionHeaderForPassenger(idx);
  if (header) return header;

  return null;
}

/** Campo CPF do pax N — na LATAM v2 é taxDocument; no pagamentos é taxDocument.documentNumber ADT_N. */
function findCpfInputForPax(i) {
  if (getPassengerFormKind() === "confirm") {
    const el = findConfirmAdtField(Number(i) + 1, "cpf");
    if (el) return el;
  }

  const named =
    document.querySelector(`input[name="passenger-${i}_taxDocument"]`) ||
    document.querySelector(
      `input[data-testid="passenger-${i}_taxDocument--text-field"]`
    ) ||
    document.querySelector(
      `input[data-testid*="passenger-${i}_taxDocument" i]`
    ) ||
    document.querySelector(`input[name="passenger-${i}_documentNumber"]`) ||
    document.querySelector(`input[name="passenger-${i}_cpf"]`) ||
    document.querySelector(`input[name="passenger-${i}_document"]`) ||
    document.querySelector(
      `input[data-testid*="passenger-${i}_documentNumber" i]`
    ) ||
    document.querySelector(`input[data-testid*="passenger-${i}_cpf" i]`);
  if (named && isVisible(named)) return named;

  const root =
    (named && passengerRoot(i)) ||
    currentPassengerFormRoot() ||
    passengerRoot(i);
  const byWord = findFieldByWord(root, ["cpf"], {
    excludeWords: ["codigo", "pais", "emissão", "emissao", "frequente"],
  });
  if (byWord && isVisible(byWord)) return byWord;

  // Heurística: input numérico curto na ficha (não nome/data/email/fone)
  for (const el of visibleTextInputs(root)) {
    if (el.type === "email" || el.type === "date") continue;
    const meta = fieldMeta(el);
    if (
      meta.includes("nome") ||
      meta.includes("sobrenome") ||
      meta.includes("nascimento") ||
      meta.includes("email") ||
      meta.includes("telefone") ||
      meta.includes("frequente")
    ) {
      continue;
    }
    if (meta.includes("contato") && meta.includes("numero")) continue;
    if (
      /\bcpf\b/.test(meta) ||
      (meta.includes("documento") && !meta.includes("pais")) ||
      el.maxLength === 11 ||
      el.maxLength === 14
    ) {
      return el;
    }
  }
  return null;
}

async function fillCpfForPax(i, pax) {
  const cpf = cpfDigitsOnly(pax.cpf);
  if (!cpf) return 0;
  const el = findCpfInputForPax(i);
  if (!el) {
    console.warn("[TradeMiles] CPF não achado pax", i);
    return await fillChildTravelDocumentWithCpf(pax);
  }
  console.info("[TradeMiles] CPF pax", i, "→", el.name || el.id || el.getAttribute("data-testid"));
  try {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    el.scrollIntoView?.({ block: "center" });
  }
  await sleep(300);
  const cur = String(el.value || "").replace(/\D/g, "");
  if (cur === cpf) return 1;

  // NÃO limpar pra "" antes — se o set falhar, o campo fica vazio
  if (setNativeValue(el, cpf, { soft: true })) {
    await sleep(150);
    if (String(el.value || "").replace(/\D/g, "") === cpf) return 1;
  }
  await typeChars(el, cpf, { clear: true, delay: 40 });
  await sleep(200);
  const ok = String(el.value || "").replace(/\D/g, "") === cpf;
  if (!ok) console.warn("[TradeMiles] CPF não grudou pax", i, el.value);
  const extra = await fillChildTravelDocumentWithCpf(pax);
  return (ok ? 1 : 0) + extra;
}

/** Criança/bebê: LATAM pede "Nº de documento" além do CPF — repete o CPF. Só CHD/INF. */
function findChildTravelDocumentInputs() {
  const out = [];
  for (const el of document.querySelectorAll("input[type='text'], input:not([type])")) {
    const id = `${el.id || ""} ${el.getAttribute("data-testid") || ""}`;
    if (!/documentInfo-documentNumber-(CHD|INF)_/i.test(id)) continue;
    if (/ADT_/i.test(id)) continue;
    try {
      if (!isVisible(el)) continue;
    } catch {
      /* segue */
    }
    out.push(el);
  }
  return out;
}

async function fillOneDocField(el, cpf) {
  const cur = String(el.value || "").replace(/\D/g, "");
  if (cur === cpf) return true;
  try {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
    el.scrollIntoView?.({ block: "center" });
  }
  await sleep(120);
  if (setNativeValue(el, cpf, { soft: true })) {
    await sleep(80);
    if (String(el.value || "").replace(/\D/g, "") === cpf) return true;
  }
  await typeChars(el, cpf, { clear: true, delay: 30 });
  await sleep(80);
  return String(el.value || "").replace(/\D/g, "") === cpf;
}

async function fillChildTravelDocumentWithCpf(pax) {
  const cpf = cpfDigitsOnly(pax.cpf);
  if (!cpf) return 0;
  const els = findChildTravelDocumentInputs();
  if (!els.length) return 0;
  let n = 0;
  for (const el of els) {
    const ok = await fillOneDocField(el, cpf);
    if (ok) {
      n++;
      console.info(
        "[TradeMiles] Nº documento criança/bebê →",
        el.id || el.getAttribute("data-testid")
      );
    } else {
      console.warn("[TradeMiles] Nº documento criança/bebê não grudou", el.id, el.value);
    }
  }
  return n;
}

function passengerRoot(idx) {
  const marker = document.querySelector(
    `input[name="passenger-${idx}_dateOfBirth"], input[name^="passenger-${idx}_"]`
  );
  if (!marker) return document.body;
  let root = marker.parentElement;
  for (let i = 0; i < 14 && root; i++) {
    if (
      root.querySelector(`input[name^="passenger-${idx}_"]`) &&
      !root.querySelector(`input[name^="passenger-${idx + 1}_"]`)
    ) {
      return root;
    }
    root = root.parentElement;
  }
  return marker.parentElement || document.body;
}

/**
 * Identifica pelo URL (mais estável que heurística):
 * - /v2/passageiros → acordeão, sem "Confirmar dados"
 * - /pagamentos/passageiros → ficha + botão Confirmar dados
 */
function getPassengerFormKind() {
  const path = location.pathname || "";
  if (/\/v2\/passageiros/i.test(path)) return "accordion";
  if (/\/pagamentos\/passageiros/i.test(path)) return "confirm";
  // Fallback se a LATAM mudar o path
  if (findConfirmDadosButton()) return "confirm";
  return "accordion";
}

function formKindLabel(kind) {
  return kind === "confirm"
    ? "pagamentos (Confirmar dados)"
    : "v2 (acordeão)";
}

function getAdultoAccordionContent(adultNumber) {
  const n = Number(adultNumber);
  if (!n) return null;
  return (
    document.getElementById(`accordion-passenger-ADT_${n}-content`) ||
    document.querySelector(`#accordion-passenger-ADT_${n}-content`) ||
    document.querySelector(
      `[id="accordion-passenger-ADT_${n}-content"]`
    ) ||
    document.querySelector(
      `[aria-labelledby="accordion-passenger-ADT_${n}"]`
    ) ||
    null
  );
}

/**
 * Cada Adulto tem SEU botão "Confirmar dados" dentro do painel ADT_N.
 * Sempre preferir o do adultNumber atual — o .find() global pega o errado/escondido.
 */
function findConfirmDadosButton(root = document, adultNumber = null) {
  const matchConfirm = (el) => {
    try {
      const t = normalizeLabel(textOf(el));
      return t === "confirmar dados" || t.startsWith("confirmar dados");
    } catch {
      return false;
    }
  };

  const toButton = (el) =>
    el.closest?.("button") ||
    (el.tagName === "BUTTON" ? el : el.closest?.('[role="button"]')) ||
    el;

  const searchIn = (scope, { requireVisible = true } = {}) => {
    if (!scope || !scope.querySelectorAll) return null;
    const nodes = Array.from(
      scope.querySelectorAll(
        "span.MuiButton-label, button, [role='button'], a"
      )
    ).filter(matchConfirm);
    for (const el of nodes) {
      const btn = toButton(el);
      if (!requireVisible) {
        if (hasLayoutSize(btn) || hasLayoutSize(el)) return btn;
        continue;
      }
      try {
        if (isVisible(btn) || isVisible(el)) return btn;
      } catch {
        if (hasLayoutSize(btn) || hasLayoutSize(el)) return btn;
      }
    }
    return null;
  };

  // 1) Painel do Adulto N (conteúdo do acordeão)
  if (adultNumber) {
    const content = getAdultoAccordionContent(adultNumber);
    if (content) {
      const hit =
        searchIn(content, { requireVisible: true }) ||
        searchIn(content, { requireVisible: false });
      if (hit) return hit;
    }
    // Região do MuiAccordion (summary + details)
    const summary = findAdultoAccordionByAdt(adultNumber);
    if (summary) {
      let p = summary.parentElement;
      for (let i = 0; i < 6 && p; i++) {
        const hit =
          searchIn(p, { requireVisible: true }) ||
          searchIn(p, { requireVisible: false });
        if (hit) return hit;
        p = p.parentElement;
      }
    }
  }

  // 2) root passado (ficha atual)
  if (root && root !== document) {
    const hit =
      searchIn(root, { requireVisible: true }) ||
      searchIn(root, { requireVisible: false });
    if (hit) return hit;
  }

  // 3) Accordion aberto (Confirmar costuma estar abaixo da dobra)
  for (let n = 1; n <= 9; n++) {
    const summary = findAdultoAccordionByAdt(n);
    if (!summary || summary.getAttribute("aria-expanded") !== "true") continue;
    const content = getAdultoAccordionContent(n);
    const hit =
      searchIn(content, { requireVisible: true }) ||
      searchIn(content, { requireVisible: false }) ||
      searchIn(summary.parentElement, { requireVisible: false });
    if (hit) return hit;
  }

  // 4) Documento — visível, senão com layout (off-screen)
  return (
    searchIn(document, { requireVisible: true }) ||
    searchIn(document, { requireVisible: false })
  );
}

function confirmButtonLooksEnabled(btn) {
  if (!btn) return false;
  if (btn.disabled) return false;
  if (btn.getAttribute?.("aria-disabled") === "true") return false;
  if (btn.classList?.contains("Mui-disabled")) return false;
  try {
    const st = btn.getAttribute("style") || "";
    if (/pointer-events\s*:\s*none/i.test(st)) return false;
  } catch {
    /* ignore */
  }
  return true;
}

/** Espera confirmação do Adulto N (próximo pode abrir com Confirmar já visível). */
async function waitConfirmAccepted({
  beforeFirstName = "",
  adultNumber = 1,
  timeoutMs = 12000,
} = {}) {
  const start = Date.now();
  let goneStreak = 0;

  const currentLooksDone = () => {
    const current = findAdultoAccordionByAdt(adultNumber);
    if (!current) return false;
    const expanded = current.getAttribute("aria-expanded") === "true";
    const summary = normalizeLabel(textOf(current)).slice(0, 120);
    // Depois de confirmar: some "Adulto N" vazio e aparece nome/CPF
    const stillEmptyLabel = new RegExp(
      `^adulto\\s*${adultNumber}\\b`
    ).test(summary);
    const hasCpfHint = /\d{5,}/.test(summary.replace(/\s/g, ""));
    const hasPersonName =
      summary.length > 12 && !stillEmptyLabel && !summary.startsWith("adulto");
    if (!expanded && (hasPersonName || hasCpfHint || !stillEmptyLabel)) {
      return true;
    }
    if (!expanded && !stillEmptyLabel) return true;
    return false;
  };

  const nextLooksOpen = () => {
    const next = findAdultoAccordionByAdt(adultNumber + 1);
    if (!next) return false;
    return next.getAttribute("aria-expanded") === "true";
  };

  while (Date.now() - start < timeoutMs) {
    // Sucesso típico pax 2→3: atual fechou e/ou próximo abriu (Confirmar já na tela)
    if (currentLooksDone()) {
      console.info("[TradeMiles] Confirmar OK — Adulto", adultNumber, "fechou/concluiu");
      await sleep(500);
      return true;
    }
    if (nextLooksOpen()) {
      const nameVal = String(findConfirmNameInput("first")?.value || "").trim();
      if (
        !beforeFirstName ||
        !nameVal ||
        normalizeLabel(nameVal) !== normalizeLabel(beforeFirstName)
      ) {
        console.info("[TradeMiles] Confirmar OK — Adulto", adultNumber + 1, "já aberto");
        await sleep(500);
        return true;
      }
    }

    const btn = findConfirmDadosButton(document, adultNumber);
    if (!btn) {
      goneStreak += 1;
      if (goneStreak >= 3) {
        await sleep(400);
        return true;
      }
    } else {
      goneStreak = 0;
      // Confirmar ainda visível do PRÓXIMO adulto — atual já concluiu
      if (currentLooksDone() || (Date.now() - start > 2500 && nextLooksOpen())) {
        await sleep(400);
        return true;
      }
    }
    await sleep(300);
  }

  if (currentLooksDone() || nextLooksOpen()) return true;
  return false;
}

/** Clica "Confirmar dados" no mundo MAIN (React/MUI). Cada Adulto tem o seu. */
function clickConfirmDadosInPage(adultNumber) {
  const id = `tm-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return new Promise((resolve) => {
    const onMsg = (ev) => {
      const data = ev.data;
      if (
        !data ||
        data.source !== "trademiles-page" ||
        data.type !== "click-confirm-dados-done" ||
        data.id !== id
      ) {
        return;
      }
      window.removeEventListener("message", onMsg);
      console.info("[TradeMiles] click-confirm-dados MAIN", {
        adultNumber,
        ok: data.ok,
        how: data.how,
      });
      resolve(!!data.ok);
    };
    window.addEventListener("message", onMsg);
    window.postMessage(
      {
        source: "trademiles",
        type: "click-confirm-dados",
        id,
        adultNumber: adultNumber || null,
      },
      "*"
    );
    setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve(false);
    }, 1500);
  });
}

async function clickConfirmDados(root, adultNumber = null) {
  // 1) Clique no MAIN world — único que gruda no MUI da LATAM
  const mainOk = await clickConfirmDadosInPage(adultNumber);
  if (mainOk) {
    await sleep(900);
    return true;
  }

  // 2) Fallback: span.MuiButton-label → .MuiButtonBase-root
  const labels = Array.from(
    document.querySelectorAll("span.MuiButton-label")
  ).filter((el) => {
    const t = normalizeLabel(textOf(el));
    return t === "confirmar dados" || t.startsWith("confirmar dados");
  });

  let target = null;
  const content = adultNumber ? getAdultoAccordionContent(adultNumber) : null;
  for (const lab of labels) {
    const btn =
      lab.closest("button") ||
      lab.closest(".MuiButtonBase-root") ||
      lab.closest('[role="button"]');
    if (!btn) continue;
    if (content && !(content.contains(btn) || content.contains(lab))) continue;
    try {
      if (isVisible(btn) || isVisible(lab)) {
        target = { btn, lab };
        break;
      }
    } catch {
      target = { btn, lab };
      break;
    }
  }
  if (!target && labels.length) {
    const lab = labels[labels.length - 1];
    target = {
      btn:
        lab.closest("button") ||
        lab.closest(".MuiButtonBase-root") ||
        lab,
      lab,
    };
  }

  if (!target) {
    const btn =
      findConfirmDadosButton(root || document, adultNumber) ||
      findConfirmDadosButton(document, adultNumber);
    if (!btn) {
      console.warn(
        "[TradeMiles] Confirmar dados NÃO achado",
        adultNumber ? `ADT_${adultNumber}` : ""
      );
      return false;
    }
    target = { btn, lab: btn.querySelector("span.MuiButton-label") };
  }

  safeScrollIntoView(target.btn);
  try {
    target.btn.disabled = false;
    target.btn.setAttribute("aria-disabled", "false");
    target.btn.classList?.remove?.("Mui-disabled");
  } catch {
    /* ignore */
  }
  await reactClickInPage(target.btn);
  try {
    target.btn.click();
  } catch {
    /* ignore */
  }
  if (target.lab) {
    await reactClickInPage(target.lab);
    try {
      target.lab.click();
    } catch {
      /* ignore */
    }
  }
  // Retry MAIN uma vez
  await clickConfirmDadosInPage(adultNumber);
  console.info("[TradeMiles] Clique Confirmar fallback", {
    adultNumber,
    tag: target.btn.tagName,
  });
  await sleep(900);
  return true;
}

async function ensurePhoneFilledForConfirm(phone) {
  if (!phone) return true;
  const digitsWant = normalizePhoneDigits(phone);
  if (digitsWant.length < 10) return false;
  for (let t = 0; t < 5; t++) {
    const el = findPhoneInput(findContactSectionRoot(), 0);
    const got = String(el?.value || "").replace(/\D/g, "");
    if (got.length >= 10) return true;
    await ensureContactSectionOpen();
    await fillContactFields(null, phone, {
      passengerIndex: visibleActivePassengerIndex(),
    });
    await sleep(200);
  }
  const el = findPhoneInput(findContactSectionRoot(), 0);
  return String(el?.value || "").replace(/\D/g, "").length >= 10;
}

/** Só botões/acordeões "Adulto N" — inclui MUI AccordionSummary. */
function findAdultoHeaderButtons() {
  const nodes = Array.from(
    document.querySelectorAll(
      "button, [role='button'], [aria-expanded], [class*='AccordionSummary'], [class*='accordion-summary' i]"
    )
  );
  const found = [];
  const seen = new Set();
  for (const el of nodes) {
    try {
      if (!isVisible(el)) continue;
    } catch {
      continue;
    }
    const t = textOf(el).split("\n")[0].trim();
    if (!/^(Adulto|Criança|Crianca|Bebê|Bebe)\s*\d+\b/i.test(t) || t.length > 40) {
      continue;
    }
    if (isUnsafeClickTarget(el)) continue;
    if (normalizeLabel(t).includes("confirmar")) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 100 || r.width > 700) continue;
    if (seen.has(el)) continue;
    seen.add(el);
    const numMatch = t.match(/(\d+)/);
    found.push({
      el,
      title: t,
      order: numMatch ? Number(numMatch[1]) : found.length + 1,
      top: r.top,
    });
  }
  found.sort((a, b) => a.order - b.order || a.top - b.top);
  return found;
}

function formRootNear(el) {
  if (!el) return document.body;
  let p = el.parentElement;
  for (let i = 0; i < 14 && p; i++) {
    const inputs = visibleTextInputs(p);
    const hasConfirm = Boolean(findConfirmDadosButton(p));
    if (inputs.length >= 3 || (inputs.length >= 2 && hasConfirm)) return p;
    p = p.parentElement;
  }
  return el.parentElement || document.body;
}

/** Primeiro input VISÍVEL que casa com os seletores (evita pegar Adulto 1 escondido). */
function queryVisibleInput(selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of list) {
    try {
      for (const el of document.querySelectorAll(sel)) {
        if (!el || el.disabled) continue;
        if (isLatamEmailField(el) || isLatamPhoneField(el)) continue;
        try {
          if (isVisible(el)) return el;
        } catch {
          /* pattern inválido — se tem size, aceita */
          try {
            const r = el.getBoundingClientRect?.();
            if (r && r.width > 2 && r.height > 2) return el;
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* selector inválido */
    }
  }
  return null;
}

/** Ficha de edição aberta (após Confirmar a LATAM abre o próximo sozinha). */
function confirmAdultFormIsOpen() {
  const first = findConfirmNameInput("first");
  const last = findConfirmNameInput("last");
  const btn = findConfirmDadosButton(document);

  // Ideal: nome + sobrenome visíveis
  if (
    first &&
    last &&
    !first.disabled &&
    !last.disabled &&
    !first.readOnly &&
    !last.readOnly
  ) {
    return true;
  }

  // Confirmar + nome (sobrenome às vezes demora 1 frame)
  if (btn && first && !first.disabled) return true;

  // Confirmar + vários campos da ficha (nome pode ter seletor diferente)
  if (btn) {
    const inputs = visibleTextInputs(
      currentPassengerFormRoot() || document.body
    );
    if (inputs.length >= 3) return true;
    const dob = findDateOfBirthInput(document.body);
    try {
      if (dob && isVisible(dob)) return true;
    } catch {
      if (dob) return true;
    }
  }

  return false;
}

async function clickAdultoHeader(el) {
  if (!el) return false;
  safeScrollIntoView(el);
  await sleep(150);
  await reactClickInPage(el);
  try {
    el.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
      })
    );
    el.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
      })
    );
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
    );
  } catch {
    /* ignore */
  }
  try {
    el.click?.();
  } catch {
    /* ignore */
  }
  // Chevron interno (MUI Accordion)
  const icon = el.querySelector?.(
    "[class*='ExpandMore'], [class*='expand'], svg, [class*='Icon']"
  );
  if (icon) {
    try {
      icon.dispatchEvent?.(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
      );
    } catch {
      /* ignore */
    }
  }
  return true;
}

/**
 * Acordeão LATAM /pagamentos:
 * <div role="button" id="accordion-passenger-ADT_2"
 *   data-testid="accordion-passenger-ADT_2-accordion" aria-expanded="false">
 */
function findAdultoAccordionByAdt(adultNumber) {
  const n = Number(adultNumber);
  if (!n || n < 1) return null;
  return (
    document.querySelector(
      `[data-testid="accordion-passenger-ADT_${n}-accordion"]`
    ) ||
    document.querySelector(`#accordion-passenger-ADT_${n}`) ||
    document.querySelector(
      `[aria-controls="accordion-passenger-ADT_${n}-content"]`
    ) ||
    null
  );
}

/**
 * Adulto aberto no /pagamentos (accordion-passenger-ADT_N).
 * IDs reais LATAM: passengerDetails-firstName-ADT_1, taxDocument-documentNumber-ADT_1…
 */
function getOpenConfirmAdultNumber() {
  for (let n = 1; n <= 9; n++) {
    const el = findAdultoAccordionByAdt(n);
    if (el && el.getAttribute("aria-expanded") === "true") return n;
  }
  for (let n = 1; n <= 9; n++) {
    const el =
      document.getElementById(`passengerDetails-firstName-ADT_${n}`) ||
      document.querySelector(
        `input[data-testid="passengerDetails-firstName-ADT_${n}-textfield-input"]`
      );
    try {
      if (el && isVisible(el)) return n;
    } catch {
      if (el) return n;
    }
  }
  return 1;
}

function findConfirmAdtField(adultNumber, key) {
  const n = Number(adultNumber) || getOpenConfirmAdultNumber();
  const map = {
    firstName: {
      id: `passengerDetails-firstName-ADT_${n}`,
      name: "passengerDetails.firstName",
      testid: `passengerDetails-firstName-ADT_${n}-textfield-input`,
    },
    lastName: {
      id: `passengerDetails-lastName-ADT_${n}`,
      name: "passengerDetails.lastName",
      testid: `passengerDetails-lastName-ADT_${n}-textfield-input`,
    },
    dob: {
      id: `passengerInfo-dateOfBirth-ADT_${n}`,
      name: "passengerInfo.dateOfBirth",
    },
    gender: {
      id: `passengerInfo-gender-ADT_${n}`,
      name: "passengerInfo.gender",
      testid: `passengerInfo-gender-ADT_${n}-select-input`,
    },
    cpf: {
      id: `taxDocument-documentNumber-ADT_${n}`,
      name: "taxDocument.documentNumber",
      testid: `taxDocument-documentNumber-ADT_${n}-textfield-input`,
    },
    email: {
      id: `passengerInfo-emails-ADT_${n}`,
      name: "passengerInfo.emails",
      testid: `passengerInfo-emails-ADT_${n}-textfield-input`,
    },
    phone: {
      id: `passengerInfo-phones0-number-ADT_${n}`,
      name: "passengerInfo.phones[0].number",
      testid: `passengerInfo-phones0-number-ADT_${n}-textfield-input`,
    },
  };
  const spec = map[key];
  if (!spec || !n) return null;

  const content = getAdultoAccordionContent(n);
  const tryPick = (el) => {
    if (!el) return null;
    try {
      if (isVisible(el)) return el;
    } catch {
      return el;
    }
    if (content && content.contains?.(el) && hasLayoutSize(el)) return el;
    return null;
  };

  const fromScope = (scope) => {
    if (!scope?.querySelector) return null;
    let el =
      (spec.id && document.getElementById(spec.id)) ||
      (spec.testid &&
        scope.querySelector(`input[data-testid="${spec.testid}"]`)) ||
      null;
    if (el && scope !== document && !scope.contains(el)) {
      el =
        (spec.testid &&
          scope.querySelector(`input[data-testid="${spec.testid}"]`)) ||
        (spec.id && scope.querySelector(`#${CSS.escape(spec.id)}`)) ||
        null;
    }
    if (!el && spec.name) {
      const nodes = [...scope.querySelectorAll(`input[name="${spec.name}"]`)];
      el =
        nodes.find((node) => (node.id || "").includes(`ADT_${n}`)) ||
        nodes.find((node) => tryPick(node)) ||
        nodes[0] ||
        null;
    }
    if (!el && spec.id) {
      el = scope.querySelector(`#${CSS.escape(spec.id)}`);
    }
    return tryPick(el) || (el && content && content.contains(el) ? el : null);
  };

  return (
    fromScope(content) ||
    fromScope(document) ||
    (spec.id ? document.getElementById(spec.id) : null)
  );
}

function isAdultoAccordionExpanded(adultNumber) {
  const el = findAdultoAccordionByAdt(adultNumber);
  if (!el) return false;
  if (el.getAttribute("aria-expanded") === "true") return true;
  const content =
    document.getElementById(`accordion-passenger-ADT_${adultNumber}-content`) ||
    document.querySelector(
      `#accordion-passenger-ADT_${adultNumber}-content, [id*="ADT_${adultNumber}-content"]`
    );
  if (content) {
    try {
      if (isVisible(content) && visibleTextInputs(content).length >= 2) {
        return true;
      }
    } catch {
      if (visibleTextInputs(content).length >= 2) return true;
    }
  }
  return false;
}

/**
 * Espera a LATAM abrir sozinha; se continuar aria-expanded=false, UM clique
 * no AccordionSummary certo (data-testid accordion-passenger-ADT_N).
 */
async function ensureAdultoAccordionOpen(adultNumber) {
  const n = Number(adultNumber);
  console.info("[TradeMiles] ensureAdultoAccordionOpen ADT_", n);

  // Só considera "já aberto" se ESTE Adulto N está expandido
  if (isAdultoAccordionExpanded(n)) {
    await sleep(400);
    if (isAdultoAccordionExpanded(n) || confirmAdultFormIsOpen()) return true;
  }

  // Espera abrir sozinho após Confirmar (~6s)
  const waitStart = Date.now();
  while (Date.now() - waitStart < 6000) {
    if (confirmAdultFormIsOpen() || isAdultoAccordionExpanded(n)) {
      await sleep(500);
      return true;
    }
    await sleep(300);
  }

  const header = findAdultoAccordionByAdt(n);
  if (!header) {
    console.warn("[TradeMiles] Accordion ADT_", n, "não encontrado no DOM");
    return confirmAdultFormIsOpen();
  }

  // Ainda fechado — UM clique no summary (não spam)
  if (header.getAttribute("aria-expanded") !== "true") {
    console.info(
      "[TradeMiles] Clique único em accordion-passenger-ADT_",
      n
    );
    await clickAdultoHeader(header);
    await sleep(1200);
  }

  for (let w = 0; w < 16; w++) {
    if (
      header.getAttribute("aria-expanded") === "true" ||
      confirmAdultFormIsOpen() ||
      isAdultoAccordionExpanded(n)
    ) {
      await sleep(400);
      return true;
    }
    await sleep(300);
  }

  return (
    confirmAdultFormIsOpen() ||
    isAdultoAccordionExpanded(n) ||
    Boolean(findConfirmDadosButton(document))
  );
}

/**
 * Adulto 1: não clica.
 * Adulto 2+: usa accordion-passenger-ADT_N (espera sozinho, 1 clique se preciso).
 */
async function expandAdultoSlot(idx) {
  const adultNumber = idx + 1;
  if (idx === 0) {
    return {
      header: findAdultoAccordionByAdt(1),
      root: currentPassengerFormRoot(),
      open: confirmAdultFormIsOpen() || Boolean(findConfirmDadosButton(document)),
    };
  }

  const open = await ensureAdultoAccordionOpen(adultNumber);
  return {
    header: findAdultoAccordionByAdt(adultNumber),
    root: currentPassengerFormRoot(),
    open,
  };
}

/** Escopo do formulário atual (painel ADT aberto ou perto do Confirmar). */
function currentPassengerFormRoot() {
  if (getPassengerFormKind() === "confirm") {
    const n = getOpenConfirmAdultNumber();
    const content = getAdultoAccordionContent(n);
    if (content) {
      try {
        if (visibleTextInputs(content).length >= 2) return content;
      } catch {
        if (content.querySelectorAll("input").length >= 2) return content;
      }
    }
  }
  const btn = findConfirmDadosButton();
  if (btn) {
    let p = btn.parentElement;
    for (let i = 0; i < 14 && p; i++) {
      const inputs = visibleTextInputs(p);
      if (inputs.length >= 3) return p;
      p = p.parentElement;
    }
  }
  if (document.querySelector(`input[name^="passenger-0_"]`)) {
    return passengerRoot(0);
  }
  return document.body;
}

/** Abre a ficha do pax N pela seta/cabeçalho — sem pressa. */
async function ensurePassengerExpanded(idx) {
  if (getPassengerFormKind() === "confirm") {
    return expandAdultoSlot(idx);
  }

  // Já aberto (campos visíveis) → não clica de novo (reclicar fecha)
  if (passengerFieldsVisible(idx)) {
    return {
      header: findPassengerExpandToggle(idx),
      root: passengerRoot(idx),
      open: true,
    };
  }

  const toggle = findPassengerExpandToggle(idx);
  if (toggle && !passengerFieldsVisible(idx)) {
    try {
      toggle.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
    } catch {
      toggle.scrollIntoView?.({ block: "center" });
    }
    await sleep(500);
    // LATAM: aria-expanded costuma ser null no trigger — confia em campos visíveis
    console.info(
      "[TradeMiles] Abrindo",
      toggle.getAttribute("data-testid") || textOf(toggle)
    );
    toggle.click?.();
    await sleep(1100);
  } else if (!toggle) {
    console.warn("[TradeMiles] Trigger Adulto", idx + 1, "não encontrado");
  }

  // Espera os campos aparecerem
  for (let t = 0; t < 8; t++) {
    if (passengerFieldsVisible(idx)) break;
    await sleep(200);
  }

  return {
    header: toggle || findPassengerExpandToggle(idx),
    root: passengerRoot(idx),
    open: passengerFieldsVisible(idx),
  };
}

async function expandPassengerSection(sec) {
  if (!sec) return;
  const idx = sec.index;
  if (typeof idx !== "number") return;
  const opened = await ensurePassengerExpanded(idx);
  sec.header = opened.header || sec.header;
  sec.root = opened.root || sec.root;
}

/** CPF na LATAM: só dígitos (sem pontos/traços). */
function cpfDigitsOnly(value) {
  const d = String(value || "").replace(/\D/g, "");
  return d.length === 11 ? d : d || null;
}

function isValidCpfDigits(raw) {
  const cpf = String(raw || "").replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

function fillInSection(root, pax, kind) {
  let n = 0;
  const limits = nameFieldLimits(root);
  const { firstName, lastName } = splitPassengerName(pax, limits);

  const nomeEl = limits.nomeEl || findFirstNameField(root);
  const sobEl = limits.sobEl || findLastNameField(root);
  // soft: evita abrir "Passageiros salvos"
  if (firstName && setNativeValue(nomeEl, firstName, { soft: true })) n++;
  if (lastName && setNativeValue(sobEl, lastName, { soft: true })) n++;

  // CPF NÃO é preenchido aqui — fillCpfForPax cuida (evitar limpar e falhar)

  return n;
}

function resolvePaxGender(pax) {
  if (pax.gender === "F" || pax.gender === "M") return pax.gender;
  const { firstName } = splitPassengerName(pax);
  return guessGenderFromName(firstName);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function showToast(msg, ok) {
  let el = document.getElementById("tm-latam-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "tm-latam-toast";
    el.style.cssText =
      "position:fixed;bottom:80px;right:16px;z-index:2147483647;max-width:320px;padding:10px 12px;border-radius:10px;font:12px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);";
    document.documentElement.appendChild(el);
  }
  el.style.background = ok ? "#ecfdf5" : "#fff7ed";
  el.style.color = ok ? "#065f46" : "#9a3412";
  el.style.border = ok ? "1px solid #a7f3d0" : "1px solid #fdba74";
  el.textContent = msg;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.remove(), 8000);
}

function ensureFab() {
  if (document.getElementById("tm-latam-fab")) return;
  const btn = document.createElement("button");
  btn.id = "tm-latam-fab";
  btn.type = "button";
  btn.textContent = "Preencher TradeMiles";
  btn.style.cssText =
    "position:fixed;bottom:20px;right:16px;z-index:2147483647;height:40px;padding:0 14px;border:0;border-radius:999px;background:#0f172a;color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(15,23,42,.35);";
  btn.addEventListener("click", () => {
    void runFill({ manual: true });
  });
  document.documentElement.appendChild(btn);
}

function findContactSectionRoot() {
  const labels = Array.from(
    document.querySelectorAll("h1, h2, h3, h4, h5, legend, span, p, div, label")
  );
  const title = labels.find((el) => {
    if (!isVisible(el)) return false;
    const t = normalizeLabel(textOf(el));
    return (
      t === "informacao de contato" ||
      t.startsWith("informacao de contato") ||
      t === "dados de contato"
    );
  });
  if (!title) return document.body;
  let p = title.parentElement;
  let best = title.parentElement || document.body;
  for (let i = 0; i < 12 && p; i++) {
    const inputs = visibleTextInputs(p);
    // Precisa e-mail + número (não parar no 1º input só do e-mail)
    if (inputs.length >= 2) return p;
    if (inputs.length >= 1) best = p;
    p = p.parentElement;
  }
  return best;
}

function checkRepeatContactCheckbox(root = document.body) {
  const check = Array.from(root.querySelectorAll('input[type="checkbox"]')).find(
    (c) => {
      const lab = c.closest("label") || c.parentElement;
      const t = normalizeLabel(textOf(lab));
      return (
        t.includes("repetir informacao de contato") ||
        t.includes("repetir informacao") ||
        t.includes("restante dos passageiros")
      );
    }
  );
  if (check && !check.checked) {
    check.click?.();
    return true;
  }
  return false;
}

function isLikelyCountryCodeInput(el) {
  if (!el) return true;
  // DDI costuma ser curto (+55)
  if (el.maxLength > 0 && el.maxLength <= 4) return true;
  // Só atributos PRÓPRIOS — fieldMeta pega "Código" + "Número" no mesmo row
  // e classificava o telefone como DDI (bug: Número nunca preenchia).
  const own = ownFieldLabel(el);
  if (/\bnumero\b/.test(own) || /\btelefone\b/.test(own) || /\bcelular\b/.test(own)) {
    return false;
  }
  return (
    /\bcodigo\b/.test(own) ||
    /\bdial\b/.test(own) ||
    /\bcountry.?code\b/.test(own) ||
    /\bddi\b/.test(own) ||
    own.includes("phone country") ||
    own.includes("codigo do pais") ||
    own.includes("phoneCountry") ||
    own.includes("countrycalling")
  );
}

function isLikelyPhoneNumberInput(el) {
  if (!el) return false;
  try {
    if (el.type === "hidden" || el.type === "checkbox") return false;
    // LATAM bug (só /pagamentos): telefone vem como type="email"
    if (el.type === "email") {
      if (getPassengerFormKind() === "confirm" && isLatamPhoneField(el)) {
        return true;
      }
      return false;
    }
    if (getPassengerFormKind() === "confirm" && isLatamPhoneField(el)) return true;
    if (isLikelyCountryCodeInput(el)) return false;
    const own = ownFieldLabel(el);
    const meta = fieldMeta(el);
    if (own.includes("email") || meta.includes("e-mail")) {
      if (!/\bnumero\b/.test(own) && !/\btelefone\b/.test(own)) return false;
    }
    if (/\bcpf\b/.test(own) || own.includes("documento")) return false;
    if (meta.includes("passageiro frequente") && !/\bnumero\b/.test(own)) {
      return false;
    }
    if (meta.includes("nascimento") && !/\bnumero\b/.test(own)) return false;
    if (
      (/\bnome\b/.test(own) || /\bsobrenome\b/.test(own)) &&
      !/\bnumero\b/.test(own)
    ) {
      return false;
    }
    if (/\bnumero\b/.test(own) || /\bnumero\b/.test(meta)) return true;
    if (el.type === "tel" || el.inputMode === "tel") return true;
    if (el.autocomplete === "tel" || el.autocomplete === "tel-national") {
      return true;
    }
    if (
      /\btelefone\b/.test(own) ||
      /\btelefone\b/.test(meta) ||
      /\bcelular\b/.test(own) ||
      /\bcelular\b/.test(meta) ||
      /\bphone\b/.test(own) ||
      /\bmobile\b/.test(own)
    ) {
      return true;
    }
    const name = normalizeLabel(el.name || el.id || "").replace(/\s+/g, "");
    if (
      /passengerinfo_number|phones?\[|phones0|contact.*number|phone.?number|phonenumber|_number$|_phone\b/.test(
        name
      )
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Campo "Número" do contato LATAM.
 * No /pagamentos/passageiros: name="passengerInfo.phones[0].number" (type=email!).
 * No /v2 mantém os seletores antigos (passenger-N_phone…).
 */
function findPhoneInput(root, idx = 0) {
  // Só no formulário "Confirmar dados" — não altera o v2/acordeão
  if (getPassengerFormKind() === "confirm") {
    const adt = findConfirmAdtField(Number(idx) + 1, "phone");
    if (adt) return adt;
    const exact = [
      'input[name="passengerInfo.phones[0].number"]',
      'input[id*="phones0-number" i]',
      'input[data-testid*="phones0-number" i]',
      'input[name*="phones[0].number"]',
      'input[name*="phones"][name*="number"]',
    ];
    for (const sel of exact) {
      try {
        const nodes = [...document.querySelectorAll(sel)];
        const el =
          nodes.find((node) => {
            try {
              return isVisible(node);
            } catch {
              return hasLayoutSize(node);
            }
          }) || nodes[0];
        if (el) return el;
      } catch {
        /* ignore */
      }
    }

    try {
      const byAria = [...document.querySelectorAll("input")].find((el) =>
        isLatamPhoneField(el)
      );
      if (byAria) return byAria;
    } catch {
      /* ignore */
    }
  }

  const safeRect = (el) => {
    try {
      return el.getBoundingClientRect();
    } catch {
      return { top: 0, left: 0, width: 1, height: 1, bottom: 1, right: 1 };
    }
  };

  const named = [
    `input[name="passenger-${idx}_passengerInfo_number"]`,
    `input[data-testid="passenger-${idx}_passengerInfo_number--text-field"]`,
    `input[name="passenger-0_passengerInfo_number"]`,
    `input[data-testid="passenger-0_passengerInfo_number--text-field"]`,
    `input[name*="passengerInfo_number" i]`,
    `input[data-testid*="passengerInfo_number" i]`,
    `input[name="passenger-${idx}_phoneNumber"]`,
    `input[name="passenger-${idx}_phone"]`,
    `input[name="passenger-0_phoneNumber"]`,
    `input[name="passenger-0_phone"]`,
    `input[name*="phoneNumber" i]`,
    `input[autocomplete="tel-national"]`,
    `input[autocomplete="tel"]`,
    `input[type="tel"]`,
    `input[inputmode="tel"]`,
  ];
  for (const sel of named) {
    try {
      const el = [...document.querySelectorAll(sel)].find((node) => {
        try {
          // No v2, type=email continua NÃO sendo telefone
          if (getPassengerFormKind() !== "confirm" && node.type === "email") {
            return false;
          }
          return isLikelyPhoneNumberInput(node);
        } catch {
          return false;
        }
      });
      if (el) return el;
    } catch {
      /* selector inválido */
    }
  }

  // Heurísticas extras (Número / após e-mail) só no confirm form
  if (getPassengerFormKind() !== "confirm") {
    // Fallback v2 clássico: rótulo telefone/número sem type=email
    try {
      const scope = root || findContactSectionRoot() || document.body;
      const candidates = visibleTextInputs(scope).filter((el) => {
        if (el.type === "email") return false;
        const meta = fieldMeta(el);
        if (meta.includes("email") || meta.includes("e-mail")) return false;
        if (meta.includes("documento") || meta.includes("cpf")) return false;
        if (el.maxLength > 0 && el.maxLength <= 4) return false;
        return (
          /\bnumero\b/.test(meta) ||
          /\btelefone\b/.test(meta) ||
          /\bcelular\b/.test(meta) ||
          el.type === "tel" ||
          el.inputMode === "tel"
        );
      });
      const byNumero = candidates.find((el) => /\bnumero\b/.test(fieldMeta(el)));
      return byNumero || candidates[0] || null;
    } catch {
      return null;
    }
  }

  try {
    const byNumero = [...document.querySelectorAll("input")].find((el) => {
      try {
        if (isLatamEmailField(el)) return false;
        if (isLikelyCountryCodeInput(el)) return false;
        const own = ownFieldLabel(el);
        const meta = fieldMeta(el);
        return (
          isLatamPhoneField(el) ||
          /\bnumero\b/.test(own) ||
          /\bnumero\b/.test(meta) ||
          /\btelefone\b/.test(own)
        );
      } catch {
        return false;
      }
    });
    if (byNumero) return byNumero;
  } catch {
    /* ignore */
  }

  // Ordem no DOM: inputs logo após o e-mail real
  try {
    const emailEl = findLatamEmailInput();
    if (emailEl) {
      const all = [
        ...document.querySelectorAll(
          "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])"
        ),
      ];
      const ei = all.indexOf(emailEl);
      if (ei >= 0) {
        const after = all.slice(ei + 1, ei + 6);
        const phone =
          after.find((el) => isLatamPhoneField(el) || isLikelyPhoneNumberInput(el)) ||
          after.find((el) => !isLikelyCountryCodeInput(el) && !isLatamEmailField(el));
        if (phone) return phone;
      }
    }
  } catch {
    /* ignore */
  }

  const scopes = [root, findContactSectionRoot(), document.body].filter(Boolean);
  for (const scope of scopes) {
    const emailEl = findLatamEmailInput() || scope.querySelector?.('input[type="email"]');
    if (!emailEl) continue;

    const contactRoot = (() => {
      let p = emailEl.parentElement;
      for (let i = 0; i < 10 && p; i++) {
        const inputs = [
          ...p.querySelectorAll(
            "input:not([type=hidden]):not([type=checkbox]):not([type=radio])"
          ),
        ];
        if (inputs.length >= 2) return p;
        p = p.parentElement;
      }
      return emailEl.closest("form") || scope || document.body;
    })();

    const candidates = [
      ...contactRoot.querySelectorAll(
        "input:not([type=hidden]):not([type=checkbox]):not([type=radio])"
      ),
    ].filter((el) => el !== emailEl && !isLatamEmailField(el));

    const near = candidates
      .filter((el) => !isLikelyCountryCodeInput(el) || isLatamPhoneField(el))
      .sort((a, b) => {
        const er = safeRect(emailEl);
        const score = (el) => {
          const r = safeRect(el);
          const dy = Math.abs(r.top - er.top);
          const dx = Math.abs(r.left - er.left);
          const phoneBonus = isLatamPhoneField(el) ? -500 : 0;
          const numeroBonus =
            /\bnumero\b/.test(ownFieldLabel(el)) || /\bnumero\b/.test(fieldMeta(el))
              ? -200
              : 0;
          return dy * 3 + dx + phoneBonus + numeroBonus;
        };
        return score(a) - score(b);
      });

    const pick =
      near.find((el) => isLatamPhoneField(el)) ||
      near.find((el) => isLikelyPhoneNumberInput(el)) ||
      near[0];
    if (pick) return pick;
  }

  return null;
}

function findLatamEmailInput(idx = 0) {
  // Seletores do /pagamentos/passageiros só no confirm
  if (getPassengerFormKind() === "confirm") {
    const adt = findConfirmAdtField(Number(idx) + 1, "email");
    if (adt) return adt;
    const exact = [
      'input[name="passengerInfo.emails"]',
      'input[id*="passengerInfo-emails" i]',
      'input[data-testid*="passengerInfo-emails" i]',
    ];
    for (const sel of exact) {
      try {
        const nodes = [...document.querySelectorAll(sel)];
        const el =
          nodes.find((node) => {
            try {
              return isVisible(node) && !isLatamPhoneField(node);
            } catch {
              return !isLatamPhoneField(node);
            }
          }) || nodes.find((node) => !isLatamPhoneField(node));
        if (el) return el;
      } catch {
        /* ignore */
      }
    }
    try {
      const el = [...document.querySelectorAll("input")].find((node) =>
        isLatamEmailField(node)
      );
      if (el) return el;
    } catch {
      /* ignore */
    }
  }

  const exactV2 = [
    `input[name="passenger-${idx}_passengerInfo_email"]`,
    `input[data-testid="passenger-${idx}_passengerInfo_email--text-field"]`,
    'input[name="passenger-0_passengerInfo_email"]',
    `input[name="passenger-${idx}_email"]`,
    'input[name="passenger-0_email"]',
    'input[type="email"]',
    'input[autocomplete="email"]',
  ];
  for (const sel of exactV2) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      // No confirm, não pegar o telefone disfarçado de email
      if (getPassengerFormKind() === "confirm" && isLatamPhoneField(el)) continue;
      return el;
    } catch {
      /* ignore */
    }
  }
  return (
    findFieldByWord(findContactSectionRoot(), ["email", "e-mail"]) ||
    findFieldByWord(document.body, ["email", "e-mail"]) ||
    null
  );
}

function normalizePhoneDigits(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  // Só DDD+número (10 ou 11)
  if (d.length > 11) d = d.slice(-11);
  return d;
}

/** Contato fica no 1º pax no v2 — preencher com a ficha dele aberta. */
async function fillContactFields(email, phone, { passengerIndex = 0 } = {}) {
  let n = 0;
  const idx = passengerIndex;

  if (email) {
    const want = String(email).trim().toLowerCase();
    const emailEl = findLatamEmailInput(idx);
    if (emailEl) {
      disarmBadPattern(emailEl);
      safeScrollIntoView(emailEl);
      setNativeValue(emailEl, want);
      await reactSetValueInPage(emailEl, want);
      await sleep(80);
      let got = String(emailEl.value || "").trim().toLowerCase();
      if (got !== want) {
        // Garante caractere a caractere se o React engoliu o final (.co vs .com)
        await typeChars(emailEl, want, { clear: true, delay: 18 });
        await sleep(60);
        got = String(emailEl.value || "").trim().toLowerCase();
        if (got !== want) {
          await reactSetValueInPage(emailEl, want);
          setNativeValue(emailEl, want);
          got = String(emailEl.value || "").trim().toLowerCase();
        }
      }
      if (got.includes("@")) n++;
      console.info("[TradeMiles] email →", { want, got, name: emailEl.name });
    } else {
      console.warn("[TradeMiles] Campo e-mail não encontrado");
    }
  }

  if (phone) {
    const digits = normalizePhoneDigits(phone);
    if (digits.length >= 10) {
      const phoneEl =
        findPhoneInput(null, idx) || findPhoneInput(document.body, idx);
      if (phoneEl) {
        console.info("[TradeMiles] telefone →", {
          name: phoneEl.name,
          id: phoneEl.id,
          testid: phoneEl.getAttribute("data-testid"),
          type: phoneEl.type,
          digits,
        });
        disarmBadPattern(phoneEl);
        // Só no confirm: LATAM marca telefone como type="email"
        if (getPassengerFormKind() === "confirm") {
          try {
            if (phoneEl.type === "email") phoneEl.setAttribute("type", "text");
          } catch {
            /* ignore */
          }
        }
        safeScrollIntoView(phoneEl);
        await typeChars(phoneEl, digits, { clear: true, delay: 28 });
        await sleep(100);
        let got = String(phoneEl.value || "").replace(/\D/g, "");
        if (got.length < 10) {
          await reactSetValueInPage(phoneEl, digits);
          setNativeValue(phoneEl, digits);
          await sleep(80);
          got = String(phoneEl.value || "").replace(/\D/g, "");
        }
        if (got.length >= 10) n++;
        else console.warn("[TradeMiles] Telefone não grudou:", phoneEl.value);
      } else {
        console.warn("[TradeMiles] Campo telefone/número não encontrado");
      }
    } else {
      console.warn("[TradeMiles] Telefone inválido no payload:", phone);
    }
  }

  if (
    checkRepeatContactCheckbox(findContactSectionRoot()) ||
    checkRepeatContactCheckbox(document.body)
  ) {
    n++;
  }
  return n;
}

function readDobInRoot(root, idx) {
  return (
    findPassengerDobInput(idx, root) ||
    findPassengerDobInput(0, root) ||
    findDateOfBirthInput(root) ||
    null
  );
}

/** Índice do passenger-N_* cujos campos estão VISÍVEIS agora (ficha aberta). */
function visibleActivePassengerIndex() {
  for (let i = 0; i < 20; i++) {
    const el = document.querySelector(
      `input[name="passenger-${i}_firstName"]`
    );
    if (el && isVisible(el)) return i;
  }
  for (const el of visibleTextInputs(document.body)) {
    const m = String(el.name || "").match(/^passenger-(\d+)_/);
    if (m) return Number(m[1]);
  }
  return 0;
}

/** Espera a ficha do próximo Adulto (LATAM abre sozinha — sem clicar). */
async function waitForConfirmNameFieldsReady({ timeoutMs = 14000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (confirmAdultFormIsOpen()) {
      await sleep(500);
      return true;
    }
    await sleep(300);
  }
  console.warn("[TradeMiles] Timeout esperando ficha do próximo Adulto");
  return confirmAdultFormIsOpen();
}

/**
 * Depois do Confirmar: espera ADT_N abrir (sozinho ou 1 clique no accordion certo).
 */
async function waitNextAdultAfterConfirm({
  previousFirstName = "",
  adultNumber = 2,
  timeoutMs = 16000,
} = {}) {
  console.info(
    "[TradeMiles] Pós-Confirmar → Adulto",
    adultNumber,
    "(accordion-passenger-ADT_" + adultNumber + ")"
  );
  await sleep(700);

  // Caminho principal: ensure com espera + no máx. 1 clique no data-testid
  const opened = await ensureAdultoAccordionOpen(adultNumber);
  if (opened) {
    // Acomoda hidratação dos inputs
    const start = Date.now();
    while (Date.now() - start < Math.min(8000, timeoutMs)) {
      if (confirmAdultFormIsOpen() || findConfirmDadosButton(document)) {
        const firstEl = findConfirmNameInput("first");
        const firstVal = String(firstEl?.value || "").trim();
        const looksNew =
          !firstVal ||
          !previousFirstName ||
          normalizeLabel(firstVal) !== normalizeLabel(previousFirstName);
        if (looksNew || Date.now() - start > 1200) {
          await sleep(400);
          return true;
        }
      }
      await sleep(300);
    }
    return true;
  }
  return false;
}

/** Nome/sobrenome do form /pagamentos — IDs passengerDetails-*-ADT_N. */
function findConfirmNameInput(which = "first", adultNumber = null) {
  const isFirst = which === "first";
  const n = adultNumber || getOpenConfirmAdultNumber();
  if (getPassengerFormKind() === "confirm") {
    const adt = findConfirmAdtField(n, isFirst ? "firstName" : "lastName");
    if (adt) return adt;
  }

  const exact = isFirst
    ? [
        'input[name="passengerDetails.firstName"]',
        'input[id*="passengerDetails-firstName" i]',
        'input[data-testid*="passengerDetails-firstName" i]',
        'input[name="passengerInfo.firstName"]',
        'input[name="passengerInfo.name"]',
        'input[id*="firstName" i]',
        'input[data-testid*="firstName" i]',
        'input[name*="firstName" i]',
        'input[autocomplete="given-name"]',
      ]
    : [
        'input[name="passengerDetails.lastName"]',
        'input[id*="passengerDetails-lastName" i]',
        'input[data-testid*="passengerDetails-lastName" i]',
        'input[name="passengerInfo.lastName"]',
        'input[name="passengerInfo.surname"]',
        'input[id*="lastName" i]',
        'input[data-testid*="lastName" i]',
        'input[name*="lastName" i]',
        'input[autocomplete="family-name"]',
      ];
  const hit = queryVisibleInput(exact);
  if (hit) return hit;

  const root = currentPassengerFormRoot();
  const byWord = isFirst
    ? findFirstNameField(root) || findFirstNameField(document.body)
    : findLastNameField(root) || findLastNameField(document.body);
  if (byWord) {
    try {
      if (isVisible(byWord)) return byWord;
    } catch {
      return byWord;
    }
  }
  return null;
}

function fieldShowsRequiredError(el) {
  if (!el) return false;
  try {
    if (el.getAttribute("aria-invalid") === "true") return true;
    let p = el.parentElement;
    for (let i = 0; i < 6 && p; i++) {
      const t = normalizeLabel(textOf(p));
      if (t.includes("este campo e obrigatorio")) return true;
      p = p.parentElement;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Preenche nome no confirm form de um jeito que o React/Formik aceita. */
async function fillConfirmNameField(el, value) {
  if (!el || !value) return false;
  try {
    if (!isVisible(el)) {
      console.warn("[TradeMiles] Nome alvo não está visível — pulando");
      return false;
    }
  } catch {
    /* continua */
  }
  disarmBadPattern(el);
  safeScrollIntoView(el);
  await dismissSavedPassengersPopover();
  await typeChars(el, value, { clear: true, delay: 22 });
  await sleep(60);
  await reactSetValueInPage(el, value);
  setNativeValue(el, value, { soft: false });
  await sleep(80);
  await dismissSavedPassengersPopover();
  const got = String(el.value || "").trim();
  if (!got) return false;
  // Aceita se igual ou se começou certo (máscara/maxLength)
  const want = normalizeLabel(value);
  const gotN = normalizeLabel(got);
  return gotN === want || gotN.startsWith(want.slice(0, Math.min(6, want.length)));
}

/** Formulário /pagamentos/passageiros — Adulto N + Confirmar dados. */
async function fillOnePassengerConfirmForm(pax, idx, opts = {}) {
  let n = 0;
  const adultNumber = idx + 1;

  // Adulto 2+: espera a LATAM abrir/hidratar os campos de nome
  if (idx > 0) {
    const ready = await waitForConfirmNameFieldsReady({ timeoutMs: 14000 });
    console.info("[TradeMiles] Campos nome prontos pax", idx + 1, ready);
    if (!ready) {
      await sleep(800);
      await waitForConfirmNameFieldsReady({ timeoutMs: 6000 });
    }
  }

  const root = currentPassengerFormRoot();
  const activeIdx = idx;
  const limits = nameFieldLimits(root);
  const { firstName, lastName } = splitPassengerName(pax, limits);

  // Nome/sobrenome ANTES de CPF/data — e só em campo visível
  if (firstName) {
    let ok = false;
    for (let attempt = 0; attempt < 8 && !ok; attempt++) {
      if (!confirmAdultFormIsOpen()) {
        // Espera abrir sozinho; expandAdultoSlot só clica no fim
        await waitForConfirmNameFieldsReady({ timeoutMs: 5000 });
        if (!confirmAdultFormIsOpen()) {
          await expandAdultoSlot(idx);
        }
      }
      const el = findConfirmNameInput("first", adultNumber);
      if (el) ok = await fillConfirmNameField(el, firstName);
      else await sleep(400);
    }
    if (ok) n++;
    else console.warn("[TradeMiles] Nome não preenchido no pax", idx + 1);
    await dismissSavedPassengersPopover();
  }
  if (lastName) {
    let ok = false;
    for (let attempt = 0; attempt < 8 && !ok; attempt++) {
      if (!confirmAdultFormIsOpen()) {
        await waitForConfirmNameFieldsReady({ timeoutMs: 5000 });
        if (!confirmAdultFormIsOpen()) {
          await expandAdultoSlot(idx);
        }
      }
      const el = findConfirmNameInput("last", adultNumber);
      if (el) ok = await fillConfirmNameField(el, lastName);
      else await sleep(400);
    }
    if (ok) n++;
    else console.warn("[TradeMiles] Sobrenome não preenchido no pax", idx + 1);
    await dismissSavedPassengersPopover();
  }

  // Sem nome não adianta seguir (Confirmar vai falhar / pax incompleto)
  const nameNow = String(
    findConfirmNameInput("first", adultNumber)?.value || ""
  ).trim();
  if (firstName && !nameNow) {
    console.warn(
      "[TradeMiles] Abortando pax",
      idx + 1,
      "— nome ainda vazio após tentativas"
    );
    return { fields: n, root: currentPassengerFormRoot(), activeIdx, nameFailed: true };
  }

  // Se ainda mostra obrigatório, tenta de novo
  const firstEl = findConfirmNameInput("first", adultNumber);
  const lastEl = findConfirmNameInput("last", adultNumber);
  if (firstName && firstEl && fieldShowsRequiredError(firstEl)) {
    await fillConfirmNameField(firstEl, firstName);
  }
  if (lastName && lastEl && fieldShowsRequiredError(lastEl)) {
    await fillConfirmNameField(lastEl, lastName);
  }

  n += await fillCpfForPax(activeIdx, pax);

  const gender = resolvePaxGender(pax);
  if (gender) {
    if (await selectGender(root, gender, activeIdx)) n++;
    else if (await selectGender(root, gender, null)) n++;
  }
  await sleep(80);

  let dobOk = false;
  if ((await fillBirthDate(root, pax, activeIdx, { expand: false })) > 0)
    dobOk = true;
  if (!dobOk && !birthFieldHasDate(readDobInRoot(root, activeIdx))) {
    if ((await fillBirthDate(root, pax, null, { expand: false })) > 0)
      dobOk = true;
  }
  if (birthFieldHasDate(readDobInRoot(root, activeIdx))) {
    dobOk = true;
    n++;
  }
  n += await fillChildTravelDocumentWithCpf(pax);

  if (opts.email || opts.phone) {
    n += await fillContactFields(opts.email, opts.phone, {
      passengerIndex: activeIdx,
    });
    const check = Array.from(
      root.querySelectorAll('input[type="checkbox"]')
    ).find((c) => {
      const lab = c.closest("label") || c.parentElement;
      return normalizeLabel(textOf(lab)).includes("repetir informacao");
    });
    if (check && !check.checked) {
      check.click?.();
      n++;
    }
  }

  await sleep(200);
  return { fields: n, root, activeIdx };
}

/** Formulário /v2/passageiros — abre Adulto N se precisar, preenche com calma. */
async function fillOnePassengerAccordion(i, pax) {
  let n = 0;
  console.info("[TradeMiles] —— pax", i + 1, "——");

  // Rola até o Adulto N (3º+ fica mais abaixo)
  if (i > 0) {
    const trigger = findPassengerExpandToggle(i);
    if (trigger) {
      try {
        trigger.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      } catch {
        trigger.scrollIntoView?.({ block: "center" });
      }
    } else {
      window.scrollBy?.({ top: 200 + i * 120, behavior: "smooth" });
    }
    await sleep(500);
  }

  let opened = await ensurePassengerExpanded(i);
  if (!opened.open) {
    await sleep(600);
    opened = await ensurePassengerExpanded(i);
  }
  await sleep(500);
  const root = passengerRoot(i);

  if (!passengerFieldsVisible(i)) {
    console.warn("[TradeMiles] Ficha pax", i, "ainda fechada");
  }

  const limits = nameFieldLimits(root);
  const { firstName, lastName } = splitPassengerName(pax, limits);
  const setByName = async (suffix, value) => {
    if (!value) return false;
    const el = document.querySelector(
      `input[name="passenger-${i}_${suffix}"]`
    );
    if (!el) return false;
    try {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      el.scrollIntoView?.({ block: "center" });
    }
    await sleep(250);
    return setNativeValue(el, value, { soft: true });
  };

  if (firstName && (await setByName("firstName", firstName))) n++;
  await sleep(400);
  if (lastName && (await setByName("lastName", lastName))) n++;
  await sleep(400);
  await dismissSavedPassengersPopover();

  n += fillInSection(root, pax, "adult");
  await sleep(350);

  // CPF por último entre docs — nunca limpar antes
  n += await fillCpfForPax(i, pax);
  await sleep(400);

  n += await fillBirthDate(root, pax, i, { expand: false });
  await sleep(450);
  if (!birthFieldHasDate(findPassengerDobInput(i, root))) {
    n += await fillBirthDate(passengerRoot(i), pax, i, { expand: false });
    await sleep(350);
  }
  n += await fillChildTravelDocumentWithCpf(pax);

  const gender = resolvePaxGender(pax);
  if (gender) {
    await sleep(300);
    if (await selectGender(passengerRoot(i), gender, i)) n++;
  }

  await dismissSavedPassengersPopover();
  await sleep(600);
  return n;
}

function findContinuarButton() {
  return (
    Array.from(document.querySelectorAll("button")).find((btn) => {
      if (!isVisible(btn)) return false;
      const t = normalizeLabel(textOf(btn));
      return t === "continuar";
    }) || null
  );
}

async function clickContinuarIfReady() {
  const btn = findContinuarButton();
  if (!btn) return false;
  // Não clica se telefone ainda obrigatório em vermelho
  const phoneEl = findPhoneInput(findContactSectionRoot(), 0);
  if (phoneEl) {
    const digits = String(phoneEl.value || "").replace(/\D/g, "");
    if (digits.length < 10) {
      console.warn("[TradeMiles] Continuar bloqueado: telefone vazio");
      return false;
    }
  }
  try {
    btn.scrollIntoView?.({ block: "center", behavior: "instant" });
  } catch {
    btn.scrollIntoView?.({ block: "center" });
  }
  btn.focus?.();
  btn.click?.();
  await sleep(600);
  return true;
}

async function ensureContactSectionOpen() {
  const phone = findPhoneInput(findContactSectionRoot(), 0);
  if (phone && isVisible(phone)) return true;
  const title = Array.from(
    document.querySelectorAll("button, [role='button'], h2, h3, legend, span")
  ).find((el) => {
    if (!isVisible(el)) return false;
    const t = normalizeLabel(textOf(el));
    return (
      t === "informacao de contato" || t.startsWith("informacao de contato")
    );
  });
  if (title && title.click) {
    title.click();
    await sleep(400);
  }
  return Boolean(findPhoneInput(findContactSectionRoot(), 0));
}

async function fillAllConfirmForm(passengers) {
  let total = 0;
  const titularEmail = passengers.find((p) => p.email)?.email || null;
  const titularPhone = passengers.find((p) => p.phone)?.phone || null;

  const ready = await waitForPassengerFormReady({ timeoutMs: 25000 });
  if (!ready || !pageStillHasPassengerForm()) {
    console.warn("[TradeMiles] Formulário Confirmar dados não carregou a tempo");
    return { sections: 0, fields: 0, form: "confirm", error: "form_not_ready" };
  }

  for (let i = 0; i < passengers.length; i++) {
    if (!pageStillHasPassengerForm()) {
      console.warn("[TradeMiles] Página sumiu antes do pax", i);
      return {
        sections: i,
        fields: total,
        form: "confirm",
        error: "page_blanked",
      };
    }

    const pax = {
      ...passengers[i],
      email: passengers[i].email || titularEmail,
      phone: passengers[i].phone || titularPhone,
    };

    // Adulto 2+: accordion-passenger-ADT_N
    if (i > 0) {
      const opened = await ensureAdultoAccordionOpen(i + 1);
      console.info("[TradeMiles] Adulto", i + 1, "accordion aberto:", opened);
      await sleep(500);
    }

    if (!pageStillHasPassengerForm()) {
      return {
        sections: i,
        fields: total,
        form: "confirm",
        error: "page_blanked",
      };
    }

    // Contato no 1º pax (checkbox "repetir"); demais só dados pessoais
    const filled = await fillOnePassengerConfirmForm(pax, i, {
      email: i === 0 ? pax.email : null,
      phone: i === 0 ? pax.phone : null,
    });
    total += filled.fields || 0;
    const root = filled.root || currentPassengerFormRoot();

    if (filled.nameFailed) {
      console.warn("[TradeMiles] Parando — nome do pax", i + 1, "falhou");
      break;
    }

    if (!pageStillHasPassengerForm()) {
      return {
        sections: i,
        fields: total,
        form: "confirm",
        error: "page_blanked",
      };
    }

    if ((filled.fields || 0) < 2) {
      console.warn("[TradeMiles] Poucos campos no pax", i, filled.fields);
      break;
    }

    // Sem telefone o Confirmar fica bloqueado — tenta até grudar
    if (i === 0 && pax.phone) {
      const phoneOk = await ensurePhoneFilledForConfirm(pax.phone);
      console.info("[TradeMiles] telefone ok antes do Confirmar:", phoneOk);
      if (!phoneOk) {
        console.warn(
          "[TradeMiles] Telefone obrigatório vazio — não dá para Confirmar"
        );
        break;
      }
    }

    // Nome ainda "obrigatório" no React → Confirmar não gruda
    {
      const limits = nameFieldLimits(root);
      const { firstName, lastName } = splitPassengerName(pax, limits);
      const firstEl = findConfirmNameInput("first");
      const lastEl = findConfirmNameInput("last");
      if (firstName && firstEl && fieldShowsRequiredError(firstEl)) {
        await fillConfirmNameField(firstEl, firstName);
      }
      if (lastName && lastEl && fieldShowsRequiredError(lastEl)) {
        await fillConfirmNameField(lastEl, lastName);
      }
      await sleep(200);
    }

    let confirmed = false;
    const adultNumber = i + 1;
    for (let t = 0; t < 16; t++) {
      const btn =
        findConfirmDadosButton(root, adultNumber) ||
        findConfirmDadosButton(document, adultNumber) ||
        findConfirmDadosButton(document);
      if (!btn) {
        // Só aceita "já confirmado" se o acordeão deste Adulto realmente fechou
        const acc = findAdultoAccordionByAdt(adultNumber);
        const closed =
          acc && acc.getAttribute("aria-expanded") === "false";
        const summary = acc ? normalizeLabel(textOf(acc)) : "";
        const stillEmpty = new RegExp(`^adulto\\s*${adultNumber}\\b`).test(
          summary
        );
        if (closed && !stillEmpty) {
          confirmed = true;
          break;
        }
        console.warn(
          "[TradeMiles] Confirmar ADT_",
          adultNumber,
          "não encontrado — retry",
          t
        );
        await sleep(500);
        continue;
      }
      if (!confirmButtonLooksEnabled(btn)) {
        const limits = nameFieldLimits(root);
        const { firstName, lastName } = splitPassengerName(pax, limits);
        const firstEl = findConfirmNameInput("first");
        const lastEl = findConfirmNameInput("last");
        if (firstName && firstEl) await fillConfirmNameField(firstEl, firstName);
        if (lastName && lastEl) await fillConfirmNameField(lastEl, lastName);
        if (i === 0 && pax.phone) await ensurePhoneFilledForConfirm(pax.phone);
        await sleep(250);
      }
      const firstEl = findConfirmNameInput("first");
      if (firstEl && fieldShowsRequiredError(firstEl)) {
        const limits = nameFieldLimits(root);
        const { firstName, lastName } = splitPassengerName(pax, limits);
        if (firstName) await fillConfirmNameField(firstEl, firstName);
        const lastEl = findConfirmNameInput("last");
        if (lastName && lastEl) await fillConfirmNameField(lastEl, lastName);
      }
      const beforeName =
        findConfirmNameInput("first")?.value ||
        findFirstNameField(document.body)?.value ||
        "";
      console.info(
        "[TradeMiles] Tentando Confirmar dados do Adulto",
        adultNumber,
        "tentativa",
        t + 1
      );
      const clicked =
        (await clickConfirmDados(root, adultNumber)) ||
        (await clickConfirmDados(document, adultNumber));
      if (clicked) {
        const accepted = await waitConfirmAccepted({
          beforeFirstName: beforeName,
          adultNumber,
          timeoutMs: 10000,
        });
        if (accepted) {
          confirmed = true;
          break;
        }
        console.warn(
          "[TradeMiles] Confirmar clicou mas Adulto",
          adultNumber,
          "não fechou",
          t
        );
      }
      await sleep(450);
    }
    if (!confirmed) {
      console.warn("[TradeMiles] Não confirmou o pax", i);
      break;
    }

    console.info("[TradeMiles] Pax", i + 1, "confirmado");
    // Espera a LATAM liberar o próximo Adulto (demora após Confirmar)
    if (i < passengers.length - 1) {
      const prevFirst =
        splitPassengerName(pax, nameFieldLimits(currentPassengerFormRoot()))
          .firstName || "";
      const nextReady = await waitNextAdultAfterConfirm({
        previousFirstName: prevFirst,
        adultNumber: i + 2,
        timeoutMs: 16000,
      });
      console.info(
        "[TradeMiles] Próximo Adulto",
        i + 2,
        "após confirmar:",
        nextReady
      );
    } else {
      await sleep(500);
    }
  }

  // Contato já foi no pax 0; só retenta se Continuar ainda bloquear
  if (pageStillHasPassengerForm() && titularPhone) {
    const phoneEl = findPhoneInput(findContactSectionRoot(), 0);
    const phoneDigits = String(phoneEl?.value || "").replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      await ensureContactSectionOpen();
      total += await fillContactFields(titularEmail, titularPhone, {
        passengerIndex: visibleActivePassengerIndex(),
      });
    }
  }

  await sleep(400);
  const continued = await clickContinuarIfReady();
  console.info("[TradeMiles] Continuar:", continued);

  return {
    sections: passengers.length,
    fields: total,
    form: "confirm",
    continued,
  };
}

async function fillAllAccordion(passengers) {
  let total = 0;
  const max = passengers.length;
  const titularEmail = passengers.find((p) => p.email)?.email || null;
  const titularPhone = passengers.find((p) => p.phone)?.phone || null;
  const enriched = passengers.map((p) => ({
    ...p,
    email: p.email || titularEmail,
    phone: p.phone || titularPhone,
  }));

  for (let i = 0; i < max; i++) {
    await dismissSavedPassengersPopover();
    await sleep(120);
    total += await fillOnePassengerAccordion(i, enriched[i]);

    // No v2 o contato fica no 1º passageiro (+ checkbox repetir).
    // Tem que preencher AINDA com a ficha 0 aberta — se deixar pro fim, cai no 2º.
    if (i === 0 && (titularEmail || titularPhone)) {
      await sleep(200);
      total += await fillContactFields(titularEmail, titularPhone, {
        passengerIndex: 0,
      });
      await sleep(150);
      // Garante de novo se a LATAM limpou e-mail ou telefone
      const emailEl =
        document.querySelector(
          `input[name="passenger-0_email"], input[type="email"]`
        ) || findFieldByWord(findContactSectionRoot(), ["email", "e-mail"]);
      const phoneEl = findPhoneInput(findContactSectionRoot(), 0);
      const emailMissing =
        titularEmail && emailEl && !String(emailEl.value || "").includes("@");
      const phoneMissing =
        titularPhone &&
        (!phoneEl ||
          String(phoneEl.value || "").replace(/\D/g, "").length < 10);
      if (emailMissing || phoneMissing) {
        total += await fillContactFields(titularEmail, titularPhone, {
          passengerIndex: 0,
        });
      }
    }
  }

  // Retry de data SEM clicar cabeçalho (expand:false) — evita apagar o 2º pax
  if (max > 1) {
    for (let i = 0; i < max; i++) {
      const dobEl = findPassengerDobInput(i, document.body);
      if (dobEl && birthFieldHasDate(dobEl)) continue;
      await sleep(150);
      total += await fillBirthDate(passengerRoot(i), enriched[i], i, {
        expand: false,
      });
    }
  }

  // Contato do 1º se ainda vazio — sem reclicar acordeão
  await sleep(200);
  const contactStillEmpty = (() => {
    const emailEl =
      document.querySelector(
        `input[name="passenger-0_email"], input[type="email"]`
      ) || findFieldByWord(findContactSectionRoot(), ["email", "e-mail"]);
    const phoneEl = findPhoneInput(findContactSectionRoot(), 0);
    const emailOk =
      !titularEmail || String(emailEl?.value || "").includes("@");
    const phoneOk =
      !titularPhone ||
      String(phoneEl?.value || "").replace(/\D/g, "").length >= 10;
    return !emailOk || !phoneOk;
  })();
  if (contactStillEmpty && (titularEmail || titularPhone)) {
    total += await fillContactFields(titularEmail, titularPhone, {
      passengerIndex: 0,
    });
  }

  await dismissSavedPassengersPopover();
  return { sections: max, fields: total, form: "accordion" };
}

async function fillAll(passengers) {
  const kind = getPassengerFormKind();
  console.info(
    "[TradeMiles] formulário:",
    formKindLabel(kind),
    location.pathname
  );
  if (kind === "confirm") return fillAllConfirmForm(passengers);
  return fillAllAccordion(passengers);
}

let fillRunning = false;

async function runFill({ manual } = {}) {
  ensureFab();
  if (fillRunning) {
    showToast("TradeMiles: já estou preenchendo…", false);
    return { ok: false, error: "busy" };
  }
  fillRunning = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: "TM_GET_FILL_PAYLOAD" });
    if (!res?.ok) {
      showToast(res?.error || "Faça login no TradeMiles (mesma janela).", false);
      return { ok: false, error: res?.error };
    }
    if (!res.data?.useExtension) {
      showToast("Extensão desligada na venda — clique Preparar extensão.", false);
      return { ok: false, error: "desligada" };
    }
    const passengers = Array.isArray(res.data.passengers) ? res.data.passengers : [];
    if (!passengers.length) {
      showToast("Sessão sem passageiros. Prepare de novo na venda.", false);
      return { ok: false, error: "sem pax" };
    }

    for (let attempt = 0; attempt < 8; attempt++) {
      if (visibleTextInputs(document.body).length >= 2) break;
      await sleep(400);
    }

    const kind = getPassengerFormKind();
    const kindLabel = formKindLabel(kind);
    showToast(`TradeMiles: detectou ${kindLabel}…`, true);
    let result = await fillAll(passengers);
    // Retry só no acordeão — no "Confirmar dados" um 2º fillAll causa loop
    if (kind === "accordion" && result.fields < 3) {
      await sleep(900);
      result = await fillAll(passengers);
    }

    const badCpfs = passengers.filter((p) => {
      const cpf = cpfDigitsOnly(p.cpf);
      if (!cpf) return false;
      if (p.cpfValid === false) return true;
      return !isValidCpfDigits(cpf);
    });

    const ok = result.fields > 0;
    if (result.error === "form_not_ready") {
      showToast(
        "TradeMiles: a LATAM ainda não carregou o formulário. Espere a página aparecer e clique de novo.",
        false
      );
    } else if (result.error === "page_blanked") {
      showToast(
        "TradeMiles: a página da LATAM sumiu. Dê F5 e clique em Preencher de novo.",
        false
      );
    } else if (ok && badCpfs.length) {
      showToast(
        `TradeMiles: preenchido, mas CPF incorreto em ${badCpfs.length} pax — confira na LATAM.`,
        false
      );
    } else {
      showToast(
        ok
          ? `TradeMiles (${kindLabel}): ${result.fields} campo(s) · ${passengers.length} pax. Revise.`
          : "TradeMiles: não achou os campos. Espere a página carregar e clique de novo.",
        ok
      );
    }
    console.info("[TradeMiles] fill", {
      manual,
      kind,
      kindLabel,
      path: location.pathname,
      result,
      passengers,
      badCpfs,
    });
    return { ok, ...result, passengers: passengers.length };
  } finally {
    fillRunning = false;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "TM_RUN_FILL") {
    runFill({ manual: true }).then(sendResponse);
    return true;
  }
  return false;
});

// Só preenche no clique do botão "Preencher TradeMiles" (ou popup).
ensureFab();
setTimeout(ensureFab, 1500);
