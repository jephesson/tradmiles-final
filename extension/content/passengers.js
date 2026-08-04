/**
 * Passageiros LATAM — /v2/passageiros e /pagamentos/passageiros
 * - Nome / sobrenome separados (não confundir "nome" com "sobrenome")
 * - Remove acentos e caracteres especiais
 * - Data: dia, mês e ano em campos separados
 */

/**
 * soft:true — não dá focus (evita abrir "Passageiros salvos" no nome).
 */
function setNativeValue(el, value, { soft = false } = {}) {
  if (!el || value == null || value === "") return false;
  const str = String(value);
  const tag = el.tagName;

  if (tag === "SELECT") {
    const needle = str.toLowerCase();
    const opt = Array.from(el.options || []).find((o) => {
      const t = (o.textContent || "").trim().toLowerCase();
      const v = String(o.value || "").toLowerCase();
      return t === needle || t.includes(needle) || v === needle;
    });
    if (!opt) return false;
    if (!soft) el.focus?.();
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

  if (!soft) el.focus?.();
  const tracker = el._valueTracker;
  if (tracker) {
    try {
      tracker.setValue(el.value || "");
    } catch {
      /* ignore */
    }
  }
  // Respeita maxLength do campo
  let out = str;
  if (el.maxLength > 0 && out.length > el.maxLength) {
    out = out.slice(0, el.maxLength);
  }
  if (setter) setter.call(el, out);
  else el.value = out;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(
    new InputEvent("input", { bubbles: true, data: out, inputType: "insertText" })
  );
  el.dispatchEvent(new Event("change", { bubbles: true }));
  if (!soft) el.dispatchEvent(new Event("blur", { bubbles: true }));
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
  // LATAM coloca `pattern` inválido no e-mail (Chrome /v). Ler computed style
  // nesses inputs estoura SyntaxError — nunca deixar isso derrubar o fill.
  try {
    const st = window.getComputedStyle(el);
    if (
      st.display === "none" ||
      st.visibility === "hidden" ||
      st.opacity === "0"
    ) {
      return false;
    }
  } catch {
    /* pattern/CSS inválido no elemento — cai no rect */
  }
  try {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  } catch {
    return false;
  }
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
  el.scrollIntoView?.({ block: "center", inline: "nearest" });
  el.focus?.();
  el.click?.();
  await sleep(30);
  if (document.activeElement !== el) el.focus?.();

  if (clear) {
    await clearInputHard(el);
    await sleep(40);
    el.focus?.();
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
    const root = currentPassengerFormRoot();
    const inputs = visibleTextInputs(root);
    const hasName =
      Boolean(document.querySelector(`input[name="passenger-0_firstName"]`)) ||
      Boolean(findFirstNameField(root));
    const hasConfirm = Boolean(findConfirmDadosButton());
    const hasDob = Boolean(findDateOfBirthInput(root));
    if (inputs.length >= 2 && (hasName || hasDob) && (hasConfirm || getPassengerFormKind() === "accordion")) {
      return true;
    }
    // Página em branco / ainda hidratando
    await sleep(400);
  }
  return false;
}

function genderFieldShows(el, gender) {
  if (!el || !gender) return false;
  const want = gender === "F" ? "feminino" : "masculino";
  const t = normalizeLabel(el.value || textOf(el) || el.getAttribute?.("aria-label"));
  if (!t) return false;
  if (t.includes(want)) return true;
  if (gender === "F" && (t === "f" || t === "female")) return true;
  if (gender === "M" && (t === "m" || t === "male")) return true;
  return false;
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

async function selectGender(root, gender, passengerIndex) {
  if (!gender) return false;
  const label = gender === "F" ? "Feminino" : "Masculino";
  const side = gender === "F" ? "female" : "male";
  let el = null;
  if (passengerIndex != null && passengerIndex >= 0) {
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
  if (!el || !isVisible(el)) el = findFieldByWord(root || document.body, ["sexo"]);
  if (!el) return false;

  if (genderFieldShows(el, gender)) return true;

  if (el.tagName === "SELECT") {
    const ok = setNativeValue(el, label);
    return ok && genderFieldShows(el, gender);
  }

  el.scrollIntoView?.({ block: "center", inline: "nearest" });
  el.focus?.();
  el.click?.();
  await sleep(450);

  // Preferência: listitem exato passenger-N_gender-female|male (só VISÍVEL)
  let hit = null;
  if (passengerIndex != null && passengerIndex >= 0) {
    const i = passengerIndex;
    hit =
      Array.from(
        document.querySelectorAll(
          `[data-testid="passenger-${i}_gender-${side}--autocomplete__listitem"]`
        )
      ).find((o) => isVisible(o)) ||
      Array.from(
        document.querySelectorAll(
          `[data-testid*="passenger-${i}_gender-${side}" i][role="option"]`
        )
      ).find((o) => isVisible(o));
    if (!hit) {
      const nested = Array.from(
        document.querySelectorAll(
          `[data-testid*="passenger-${i}_gender-${side}" i]`
        )
      ).find((o) => isVisible(o));
      if (nested) {
        hit =
          nested.closest?.(
            '[role="option"], [role="menuitem"], li, [data-testid*="listitem"]'
          ) || nested;
      }
    }
  }
  if (!hit || !isVisible(hit)) {
    const want = normalizeLabel(label);
    hit = Array.from(
      document.querySelectorAll(
        '[role="listbox"] [role="option"], [role="option"], [role="menuitem"]'
      )
    ).find((o) => {
      if (!isVisible(o)) return false;
      const t = normalizeLabel(textOf(o));
      return t === want || t.startsWith(want + " ");
    });
  }

  if (hit && isVisible(hit)) {
    const ok = await reactClickInPage(hit);
    if (!ok) hit.click?.();
    await sleep(250);
  }

  // Sem Escape — na LATAM isso já derrubou o acordeão
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

/** Campo CPF do pax N — na LATAM v2 é taxDocument (não documentNumber). */
function findCpfInputForPax(i) {
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
    return 0;
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
  return ok ? 1 : 0;
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

function findConfirmDadosButton(root = document) {
  const scope = root && root.querySelectorAll ? root : document;
  return (
    Array.from(scope.querySelectorAll("button")).find((btn) => {
      if (!isVisible(btn)) return false;
      const t = normalizeLabel(textOf(btn));
      return t === "confirmar dados" || t.startsWith("confirmar dados");
    }) || null
  );
}

async function clickConfirmDados(root) {
  const btn = findConfirmDadosButton(root || document);
  if (!btn) return false;
  try {
    btn.scrollIntoView?.({ block: "center", behavior: "instant" });
  } catch {
    btn.scrollIntoView?.({ block: "center" });
  }
  btn.focus?.();
  btn.click?.();
  await sleep(900);
  return true;
}

/** Só botões reais "Adulto N" — nunca div/span solto (clique errado some a página). */
function findAdultoHeaderButtons() {
  const nodes = Array.from(
    document.querySelectorAll("button, [role='button']")
  );
  const found = [];
  const seen = new Set();
  for (const el of nodes) {
    if (!isVisible(el)) continue;
    const t = textOf(el);
    if (!/^(Adulto|Criança|Crianca|Bebê|Bebe)\s*\d*\b/i.test(t) || t.length > 36) {
      continue;
    }
    if (isUnsafeClickTarget(el)) continue;
    if (normalizeLabel(t).includes("confirmar")) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 80 || r.width > 600) continue;
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

/**
 * Adulto 1: NÃO clica se o form já está visível (clicar fecha e some tudo).
 * Adulto 2+: SEMPRE clica no cabeçalho "Adulto N" (não confiar em formRootNear
 * do documento inteiro — isso via o Adulto 1 aberto e pulava o clique).
 */
async function expandAdultoSlot(idx) {
  const formVisible =
    Boolean(findConfirmDadosButton(document)) ||
    Boolean(findDateOfBirthInput(document.body)) ||
    Boolean(findFirstNameField(document.body));

  // Primeiro adulto: usa o que já está na tela
  if (idx === 0 && formVisible) {
    return {
      header: null,
      root: currentPassengerFormRoot(),
      open: true,
    };
  }

  const headers = findAdultoHeaderButtons();
  const slot = headers.find((h) => h.order === idx + 1) || null;
  if (!slot) {
    console.warn("[TradeMiles] Cabeçalho Adulto", idx + 1, "não encontrado");
    return {
      header: null,
      root: currentPassengerFormRoot(),
      open: formVisible,
    };
  }

  try {
    slot.el.scrollIntoView?.({ block: "center", behavior: "instant" });
  } catch {
    slot.el.scrollIntoView?.({ block: "center" });
  }
  await sleep(200);

  const ariaOpen = slot.el.getAttribute?.("aria-expanded") === "true";
  // idx>0: sempre tenta abrir (exceto se aria diz aberto E já há campos
  // só neste item — não no documento inteiro)
  const itemRoot = (() => {
    let p = slot.el.parentElement;
    for (let i = 0; i < 8 && p; i++) {
      const otherAdults = findAdultoHeaderButtons().filter(
        (h) => h.el !== slot.el && p.contains(h.el)
      );
      if (otherAdults.length === 0 && visibleTextInputs(p).length >= 2) {
        return p;
      }
      if (otherAdults.length === 0) {
        const maybe = p;
        p = p.parentElement;
        if (!p) return maybe;
        continue;
      }
      p = p.parentElement;
    }
    return slot.el.parentElement || document.body;
  })();

  const fieldsHere = visibleTextInputs(itemRoot).length >= 2;
  if (!(ariaOpen && fieldsHere)) {
    const beforeName =
      findFirstNameField(document.body)?.value ||
      document.querySelector('input[name$="_firstName"]')?.value ||
      "";
    slot.el.click?.();
    await sleep(850);
    // Se a LATAM fechou tudo, tenta de novo
    if (visibleTextInputs(document.body).length < 2) {
      slot.el.click?.();
      await sleep(850);
    }
    // Espera trocar o formulário ativo
    for (let t = 0; t < 10; t++) {
      const nowName =
        findFirstNameField(document.body)?.value ||
        document.querySelector('input[name$="_firstName"]')?.value ||
        "";
      if (
        visibleTextInputs(document.body).length >= 2 &&
        (t >= 3 || nowName !== beforeName || !beforeName)
      ) {
        break;
      }
      await sleep(200);
    }
  }

  return {
    header: slot.el,
    root: currentPassengerFormRoot(),
    open: visibleTextInputs(currentPassengerFormRoot()).length >= 2,
  };
}

/** Escopo do formulário atual (perto do botão Confirmar dados). */
function currentPassengerFormRoot() {
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
  for (let i = 0; i < 10 && p; i++) {
    if (visibleTextInputs(p).length >= 1) return p;
    p = p.parentElement;
  }
  return title.parentElement || document.body;
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

/**
 * Campo "Número" do contato LATAM.
 * Cuidado: NÃO excluir por "codigo" no meta — o +55 fica no mesmo bloco
 * e fazia a busca pular o telefone.
 */
function findPhoneInput(root, idx = 0) {
  const scope = root || findContactSectionRoot() || document.body;
  const named = [
    `input[name="passenger-${idx}_passengerInfo_number"]`,
    `input[data-testid="passenger-${idx}_passengerInfo_number--text-field"]`,
    `input[name="passenger-0_passengerInfo_number"]`,
    `input[data-testid="passenger-0_passengerInfo_number--text-field"]`,
    `input[name="passenger-${idx}_phoneNumber"]`,
    `input[name="passenger-${idx}_phone"]`,
    `input[name="passenger-${idx}_mobilePhone"]`,
    `input[name="passenger-0_phoneNumber"]`,
    `input[name="passenger-0_phone"]`,
    `input[autocomplete="tel"]`,
    `input[autocomplete="tel-national"]`,
    `input[type="tel"]`,
    `input[inputmode="tel"]`,
  ];
  for (const sel of named) {
    try {
      const el = [...document.querySelectorAll(sel)].find((node) => {
        try {
          return isVisible(node);
        } catch {
          return false;
        }
      });
      if (!el) continue;
      let meta = "";
      try {
        meta = fieldMeta(el);
      } catch {
        meta = String(el.name || el.id || "");
      }
      if (meta.includes("email")) continue;
      if (meta.includes("documento") || meta.includes("cpf")) continue;
      // DDI / código do país (curto)
      if (el.maxLength > 0 && el.maxLength <= 4) continue;
      return el;
    } catch {
      /* selector inválido em algum browser */
    }
  }

  // Fallback amplo: input ao lado do e-mail / com aria Número
  try {
    const byAria = [...document.querySelectorAll("input")].find((el) => {
      try {
        if (!isVisible(el)) return false;
        const aria = normalizeLabel(el.getAttribute("aria-label") || "");
        const ph = normalizeLabel(el.placeholder || "");
        const name = normalizeLabel(el.name || "");
        if (el.type === "email") return false;
        if (aria === "numero" || ph === "numero" || /\bnumber\b/.test(name)) {
          return el.maxLength === 0 || el.maxLength > 4;
        }
        return false;
      } catch {
        return false;
      }
    });
    if (byAria) return byAria;
  } catch {
    /* ignore */
  }

  const candidates = visibleTextInputs(scope).filter((el) => {
    if (el.type === "email") return false;
    const meta = fieldMeta(el);
    if (meta.includes("email") || meta.includes("e-mail")) return false;
    if (meta.includes("documento") || meta.includes("cpf")) return false;
    if (meta.includes("passageiro frequente")) return false;
    if (meta.includes("nascimento")) return false;
    if (meta.includes("nome") || meta.includes("sobrenome")) return false;
    if (el.maxLength > 0 && el.maxLength <= 4) return false;
    return (
      /\bnumero\b/.test(meta) ||
      /\btelefone\b/.test(meta) ||
      /\bcelular\b/.test(meta) ||
      el.type === "tel" ||
      el.inputMode === "tel" ||
      el.inputMode === "numeric"
    );
  });

  // Prefere o que tem rótulo "numero" (ao lado do Código +55)
  const byNumero = candidates.find((el) => /\bnumero\b/.test(fieldMeta(el)));
  if (byNumero) return byNumero;

  // Perto do e-mail / bandeira +55
  const emailEl =
    scope.querySelector?.('input[type="email"]') ||
    [...visibleTextInputs(scope)].find((el) => el.type === "email");
  if (emailEl) {
    const near = candidates.find((el) => {
      const er = emailEl.getBoundingClientRect();
      const pr = el.getBoundingClientRect();
      return Math.abs(pr.top - er.top) < 80 && pr.left >= er.left - 40;
    });
    if (near) return near;
  }

  return candidates[0] || null;
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
  const root = findContactSectionRoot();
  const idx = passengerIndex;

  if (email) {
    const want = String(email).trim().toLowerCase();
    const emailEl =
      document.querySelector(
        `input[name="passenger-${idx}_passengerInfo_email"]`
      ) ||
      document.querySelector(
        `input[data-testid="passenger-${idx}_passengerInfo_email--text-field"]`
      ) ||
      document.querySelector(
        `input[name="passenger-0_passengerInfo_email"]`
      ) ||
      document.querySelector(
        `input[name="passenger-${idx}_email"], input[name="passenger-0_email"], input[type="email"], input[autocomplete="email"]`
      ) ||
      findFieldByWord(root, ["email", "e-mail"]) ||
      findFieldByWord(document.body, ["email", "e-mail"]);
    if (emailEl && isVisible(emailEl)) {
      if (setNativeValue(emailEl, want)) n++;
    }
  }

  if (phone) {
    const digits = normalizePhoneDigits(phone);
    if (digits.length >= 10) {
      const phoneEl =
        findPhoneInput(root, idx) || findPhoneInput(document.body, idx);
      if (phoneEl) {
        console.info("[TradeMiles] telefone →", {
          name: phoneEl.name,
          id: phoneEl.id,
          testid: phoneEl.getAttribute("data-testid"),
          placeholder: phoneEl.placeholder,
          meta: fieldMeta(phoneEl).slice(0, 120),
          digits,
        });
        // Máscara LATAM: digitar dígitos (DDD + número)
        await typeChars(phoneEl, digits, { clear: true, delay: 35 });
        await sleep(120);
        const got = String(phoneEl.value || "").replace(/\D/g, "");
        if (got.length >= 10) {
          n++;
        } else {
          setNativeValue(phoneEl, digits);
          await sleep(80);
          if (String(phoneEl.value || "").replace(/\D/g, "").length >= 10) n++;
          else
            console.warn("[TradeMiles] Telefone não grudou:", phoneEl.value);
        }
      } else {
        console.warn("[TradeMiles] Campo telefone/número não encontrado");
      }
    } else {
      console.warn("[TradeMiles] Telefone inválido no payload:", phone);
    }
  }

  if (
    checkRepeatContactCheckbox(root) ||
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

/** Formulário /pagamentos/passageiros — Adulto N + Confirmar dados. */
async function fillOnePassengerConfirmForm(pax, idx, opts = {}) {
  let n = 0;
  const root = currentPassengerFormRoot();
  // Na prática a LATAM reusa o slot visível (muitas vezes passenger-0_*).
  // NUNCA cair no passenger-0_ "escondido" de outro índice — isso reescrevia o Adulto 1.
  const activeIdx = visibleActivePassengerIndex();
  const limits = nameFieldLimits(root);
  const { firstName, lastName } = splitPassengerName(pax, limits);

  const setByName = (suffix, value) => {
    if (!value) return false;
    const el = document.querySelector(
      `input[name="passenger-${activeIdx}_${suffix}"]`
    );
    if (el && isVisible(el)) {
      return setNativeValue(el, value, { soft: true });
    }
    return false;
  };

  // Nome (uma vez) — Escape se abrir "Passageiros salvos"
  if (firstName) {
    if (setByName("firstName", firstName)) n++;
    else if (setNativeValue(findFirstNameField(root), firstName, { soft: true }))
      n++;
    await dismissSavedPassengersPopover();
  }
  if (lastName) {
    if (setByName("lastName", lastName)) n++;
    else if (setNativeValue(findLastNameField(root), lastName, { soft: true }))
      n++;
    await dismissSavedPassengersPopover();
  }

  n += await fillCpfForPax(activeIdx, pax);

  const gender = resolvePaxGender(pax);
  if (gender) {
    if (await selectGender(root, gender, activeIdx)) n++;
    else if (await selectGender(root, gender, null)) n++;
  }
  await sleep(80);

  // Data — só no índice ativo / root visível (sem fallback silencioso p/ pax 0 errado)
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

    // Adulto 1 já vem aberto — não clica cabeçalho. Adulto 2+ abre SEMPRE.
    if (i > 0) {
      const opened = await expandAdultoSlot(i);
      console.info("[TradeMiles] Abriu Adulto", i + 1, opened);
      await sleep(500);
      if (!opened.open) {
        await expandAdultoSlot(i);
        await sleep(500);
      }
    }

    if (!pageStillHasPassengerForm()) {
      return {
        sections: i,
        fields: total,
        form: "confirm",
        error: "page_blanked",
      };
    }

    const filled = await fillOnePassengerConfirmForm(pax, i, {
      email: i === 0 ? pax.email : null,
      phone: i === 0 ? pax.phone : null,
    });
    total += filled.fields || 0;
    const root = filled.root || currentPassengerFormRoot();

    if (!pageStillHasPassengerForm()) {
      return {
        sections: i,
        fields: total,
        form: "confirm",
        error: "page_blanked",
      };
    }

    // Só confirma se preencheu algo (confirma vazio quebra a LATAM)
    if ((filled.fields || 0) < 2) {
      console.warn("[TradeMiles] Poucos campos no pax", i, filled.fields);
      break;
    }

    let confirmed = false;
    for (let t = 0; t < 12; t++) {
      if (findConfirmDadosButton(root) || findConfirmDadosButton(document)) {
        confirmed =
          (await clickConfirmDados(root)) ||
          (await clickConfirmDados(document));
        if (confirmed) break;
      }
      await sleep(400);
    }
    if (!confirmed) {
      console.warn("[TradeMiles] Botão Confirmar dados não encontrado no pax", i);
      break;
    }

    await sleep(900);
  }

  if (pageStillHasPassengerForm()) {
    await ensureContactSectionOpen();
    total += await fillContactFields(titularEmail, titularPhone, {
      passengerIndex: visibleActivePassengerIndex(),
    });
    // Segunda tentativa no telefone (máscara React às vezes engole a 1ª)
    const phoneEl = findPhoneInput(findContactSectionRoot(), 0);
    const phoneDigits = String(phoneEl?.value || "").replace(/\D/g, "");
    if (titularPhone && phoneDigits.length < 10) {
      await sleep(200);
      total += await fillContactFields(null, titularPhone, {
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
