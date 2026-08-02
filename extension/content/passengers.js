/**
 * Passageiros LATAM — /v2/passageiros e /pagamentos/passageiros
 * - Nome / sobrenome separados (não confundir "nome" com "sobrenome")
 * - Remove acentos e caracteres especiais
 * - Data: dia, mês e ano em campos separados
 */

function setNativeValue(el, value) {
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

/** LATAM: só letras/espaços, sem acento nem especiais. */
function sanitizeLatamName(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitPassengerName(pax) {
  let first = sanitizeLatamName(pax.firstName);
  let last = sanitizeLatamName(pax.lastName);

  // Se veio tudo no sobrenome / nome colado
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
  // Evita nome completo no sobrenome se first ainda estiver vazio
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
  return { firstName: first, lastName: last };
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
  return {
    day: String(Number(d)).padStart(2, "0"),
    month: String(Number(m)).padStart(2, "0"),
    year,
  };
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
  if (clear) {
    await clearInputHard(el);
    await sleep(40);
  }

  const proto = HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

  // Preferência: insertText (máscaras React/LATAM costumam ouvir isso)
  let usedExec = false;
  try {
    if (document.execCommand) {
      usedExec = document.execCommand("insertText", false, str);
    }
  } catch {
    usedExec = false;
  }
  if (usedExec && birthFieldHasDate(el)) {
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }
  if (usedExec) await clearInputHard(el);

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

  el.focus?.();
  el.click?.();
  const tracker = el._valueTracker;
  if (tracker) {
    try {
      tracker.setValue("");
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

  try {
    el.valueAsDate = new Date(
      Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
    );
  } catch {
    /* ignore */
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: iso,
      inputType: "insertFromPaste",
    })
  );
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));

  if (el.value === iso || birthFieldHasDate(el)) return true;
  el.setAttribute("value", iso);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return el.value === iso || birthFieldHasDate(el);
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
 */
async function fillBirthDate(root, pax, passengerIndex) {
  const parts = birthParts(pax);
  if (!parts) {
    console.warn("[TradeMiles] Pax sem data de nascimento no payload", pax);
    return 0;
  }

  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  const digits = `${parts.day}${parts.month}${parts.year}`;
  const pretty = `${parts.day}/${parts.month}/${parts.year}`;
  const spaced = `${parts.day} / ${parts.month} / ${parts.year}`;

  if (passengerIndex != null && passengerIndex >= 0) {
    await ensurePassengerExpanded(passengerIndex);
    await sleep(200);
  }

  let el = findPassengerDobInput(passengerIndex, root);
  if (el && !isVisible(el) && passengerIndex != null) {
    await ensurePassengerExpanded(passengerIndex);
    await sleep(350);
    el = findPassengerDobInput(passengerIndex, root);
  }
  if (!el || !isVisible(el)) {
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

  el.scrollIntoView?.({ block: "center", inline: "nearest" });
  el.focus?.();
  el.click?.();
  await sleep(100);

  // Só ISO em input type="date" nativo
  if (el.type === "date") {
    if (fillNativeDateInput(el, parts)) {
      await sleep(80);
      if (!birthFieldHasDate(el) || el.value !== iso) {
        fillNativeDateInput(el, parts);
        await sleep(80);
      }
      if (birthFieldHasDate(el)) return 1;
    }
  }

  // Máscara "dd / mm / aaaa": só os 8 dígitos
  await typeChars(el, digits, { clear: true, delay: 45 });
  await sleep(160);
  if (birthFieldHasDate(el)) return 1;

  // Digitação mais lenta
  await typeChars(el, digits, { clear: true, delay: 70 });
  await sleep(160);
  if (birthFieldHasDate(el)) return 1;

  // Valor já formatado com espaços (como a máscara exibe)
  await typeChars(el, spaced, { clear: true, delay: 35 });
  await sleep(120);
  if (birthFieldHasDate(el)) return 1;

  setNativeValue(el, pretty);
  await sleep(80);
  if (birthFieldHasDate(el)) return 1;

  setNativeValue(el, spaced);
  await sleep(80);
  if (birthFieldHasDate(el)) return 1;

  if (/dateofbirth/i.test(el.name || el.id || el.getAttribute("data-testid") || "")) {
    if (fillNativeDateInput(el, parts)) return 1;
    if (setNativeValue(el, iso) && birthFieldHasDate(el)) return 1;
  }

  console.warn("[TradeMiles] Data de nascimento não grudou:", {
    value: el.value,
    type: el.type,
    name: el.name,
    id: el.id,
    placeholder: el.placeholder,
    testid: el.getAttribute("data-testid"),
    iso,
    pretty,
    digits,
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

function savedPassengersPopoverEls() {
  return Array.from(
    document.querySelectorAll(
      '[role="listbox"], [role="dialog"], [role="menu"], [class*="popover" i], [class*="dropdown" i], [class*="autocomplete" i], div, section, aside'
    )
  ).filter((el) => {
    if (!isVisible(el)) return false;
    const t = normalizeLabel(textOf(el).slice(0, 120));
    return t.includes("passageiros salvos") || t.includes("passageiro salvo");
  });
}

/** Escape leve — não clica no body (isso atrapalha a máscara da data). */
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

/** Só age se o popover "Passageiros salvos" estiver aberto. */
async function dismissSavedPassengersPopover() {
  let pops = savedPassengersPopoverEls();
  if (!pops.length) return false;

  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
    active.blur?.();
  }
  closeOpenMenus();
  await sleep(60);
  closeOpenMenus();

  pops = savedPassengersPopoverEls();
  for (const el of pops) {
    const closer = el.querySelector?.(
      'button[aria-label*="fechar" i], button[aria-label*="close" i]'
    );
    closer?.click?.();
    try {
      el.style.setProperty("display", "none", "important");
      el.setAttribute("hidden", "true");
      el.setAttribute("aria-hidden", "true");
    } catch {
      /* ignore */
    }
  }
  await sleep(80);
  return true;
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

async function selectGender(root, gender, passengerIndex) {
  if (!gender) return false;
  const label = gender === "F" ? "Feminino" : "Masculino";
  let el = null;
  if (passengerIndex != null && passengerIndex >= 0) {
    el = document.querySelector(
      `input[name="passenger-${passengerIndex}_gender"], ` +
        `select[name="passenger-${passengerIndex}_gender"], ` +
        `input[name="passenger-${passengerIndex}_sex"], ` +
        `select[name="passenger-${passengerIndex}_sex"], ` +
        `[data-testid*="passenger-${passengerIndex}_gender" i], ` +
        `[name="passenger-${passengerIndex}_gender"]`
    );
  }
  if (!el || !isVisible(el)) el = findFieldByWord(root, ["sexo"]);
  if (!el) return false;

  if (genderFieldShows(el, gender)) return true;

  if (el.tagName === "SELECT") {
    const ok = setNativeValue(el, label);
    return ok && genderFieldShows(el, gender);
  }

  closeOpenMenus();
  await sleep(80);

  el.focus?.();
  el.click?.();
  await sleep(280);

  const short = gender === "F" ? "f" : "m";
  const hit = Array.from(
    document.querySelectorAll(
      '[role="option"], li[role="option"], [role="listbox"] li, ul li, button, span, div'
    )
  ).find((o) => {
    if (!isVisible(o)) return false;
    const t = normalizeLabel(textOf(o));
    return (
      t === normalizeLabel(label) ||
      t === short ||
      (gender === "F" && t.includes("feminino")) ||
      (gender === "M" && t.includes("masculino") && !t.includes("feminino"))
    );
  });

  if (hit) {
    hit.scrollIntoView?.({ block: "nearest" });
    hit.dispatchEvent?.(new MouseEvent("mousedown", { bubbles: true }));
    hit.dispatchEvent?.(new MouseEvent("mouseup", { bubbles: true }));
    hit.click?.();
    await sleep(120);
  }

  // Fecha lista — se ficar aberta, trava o próximo passageiro
  closeOpenMenus();
  await sleep(100);
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

    // Cabeçalho clicável do acordeão (Adulto N / nome)
    let header = null;
    let cur = root;
    for (let h = 0; h < 6 && cur; h++) {
      const btn = cur.querySelector?.(
        "button[aria-expanded], [role='button'][aria-expanded], button"
      );
      if (btn) {
        const bt = textOf(btn);
        if (
          /adulto|crianca|criança|bebe|bebê/i.test(bt) ||
          (bt.length > 2 && bt.length < 48)
        ) {
          header = btn;
          break;
        }
      }
      // botão irmão acima
      const prev = cur.previousElementSibling;
      if (prev && /button|header/i.test(prev.tagName + (prev.getAttribute("role") || ""))) {
        header = prev.querySelector?.("button, [role='button']") || prev;
        break;
      }
      cur = cur.parentElement;
    }

    // Fallback: botão "Adulto N" na página pela ordem
    if (!header) {
      const adultBtns = Array.from(
        document.querySelectorAll("button, [role='button'], [aria-expanded]")
      ).filter((b) => /^(Adulto|Criança|Crianca|Bebê|Bebe)\b/i.test(textOf(b)));
      header = adultBtns[i] || null;
    }

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

  let node = marker.parentElement;
  for (let up = 0; up < 16 && node && node !== document.body; up++) {
    const onlyThis =
      node.querySelector(`input[name^="passenger-${idx}_"]`) &&
      !node.querySelector(`input[name^="passenger-${idx + 1}_"]`);
    if (onlyThis) {
      const direct = [
        ...node.querySelectorAll(
          "button[aria-expanded], [role='button'][aria-expanded]"
        ),
      ].find((b) => {
        const pos = b.compareDocumentPosition(marker);
        return Boolean(pos & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      if (direct) return direct;

      let sib = node.previousElementSibling;
      for (let s = 0; s < 4 && sib; s++) {
        if (sib.matches?.("button[aria-expanded], [role='button'][aria-expanded]")) {
          return sib;
        }
        const inner = sib.querySelector?.(
          "button[aria-expanded], [role='button'][aria-expanded]"
        );
        if (inner) return inner;
        sib = sib.previousElementSibling;
      }
    }
    node = node.parentElement;
  }
  return null;
}

function passengerFieldsVisible(idx) {
  const el =
    document.querySelector(`input[name="passenger-${idx}_dateOfBirth"]`) ||
    document.querySelector(`input[name="passenger-${idx}_firstName"]`);
  return Boolean(el && isVisible(el));
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

/** Reabre a ficha do passageiro N até os campos ficarem visíveis. */
async function ensurePassengerExpanded(idx) {
  const header =
    findAccordionHeaderForPassenger(idx) ||
    // fallback legado: "Adulto N" só se ainda existir
    Array.from(
      document.querySelectorAll("button[aria-expanded], [role='button'][aria-expanded]")
    ).filter((b) => /^(Adulto|Criança|Crianca|Bebê|Bebe)\b/i.test(textOf(b)))[idx] ||
    null;

  if (header) {
    try {
      header.scrollIntoView?.({ block: "center", behavior: "instant" });
    } catch {
      header.scrollIntoView?.({ block: "center" });
    }
  }

  // Critério real: campo visível — inputs no DOM com acordeão fechado enganam.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (passengerFieldsVisible(idx)) break;
    header?.click?.();
    await sleep(500 + attempt * 80);
  }

  if (header?.getAttribute?.("aria-expanded") === "false" && !passengerFieldsVisible(idx)) {
    header.click?.();
    await sleep(550);
  }

  return {
    header,
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
  const { firstName, lastName } = splitPassengerName(pax);
  const cpf = cpfDigitsOnly(pax.cpf);

  const nomeEl = findFirstNameField(root);
  const sobEl = findLastNameField(root);
  if (firstName && setNativeValue(nomeEl, firstName)) n++;
  if (lastName && setNativeValue(sobEl, lastName)) n++;

  const cpfEl = findFieldByWord(root, ["cpf"]);
  if (cpf && cpfEl) {
    setNativeValue(cpfEl, "");
    if (setNativeValue(cpfEl, cpf)) n++;
  }
  if ((kind === "child" || kind === "infant") && cpf) {
    const docEl = findFieldByWord(root, [
      "numero de documento",
      "n de documento",
    ]);
    if (docEl) {
      setNativeValue(docEl, "");
      setNativeValue(docEl, cpf);
    }
  }

  return n;
}

function resolvePaxGender(pax) {
  if (pax.gender === "F" || pax.gender === "M") return pax.gender;
  const { firstName } = splitPassengerName(pax);
  return guessGenderFromName(firstName);
}

async function fillInSectionAsync(root, pax, kind, passengerIndex) {
  let n = fillInSection(root, pax, kind);
  n += await fillBirthDate(root, pax, passengerIndex);

  // Se a data não grudou (acordeão / React), tenta de novo no campo nomeado
  if (passengerIndex != null && passengerIndex >= 0) {
    const dobEl = document.querySelector(
      `input[name="passenger-${passengerIndex}_dateOfBirth"]`
    );
    if (dobEl && !birthFieldHasDate(dobEl)) {
      n += await fillBirthDate(root, pax, passengerIndex);
    }
  }

  const gender = resolvePaxGender(pax);
  if (gender && (await selectGender(root, gender, passengerIndex))) n++;

  // Contato fica no final da página (global) — não preencher por pax aqui,
  // senão o 1º pax pode “roubar” o foco e o 2º bagunça o 1º.

  closeOpenMenus();
  await sleep(200);
  return n;
}

/** Confere e regrava campos críticos (LATAM apaga o 1º pax ao abrir o 2º). */
async function repairPassenger(i, pax) {
  let n = 0;
  const sections = findPassengerSections(i + 1);
  const sec = sections.find((s) => s.index === i) || sections[i];
  if (sec) await expandPassengerSection(sec);

  const { firstName, lastName } = splitPassengerName(pax);
  const setByName = (suffix, value) => {
    if (!value) return false;
    const el = document.querySelector(
      `input[name="passenger-${i}_${suffix}"], input[data-testid*="passenger-${i}_${suffix}" i]`
    );
    if (!el) return false;
    const cur = String(el.value || "").trim();
    if (cur && sanitizeLatamName(cur) === sanitizeLatamName(value)) return false;
    return setNativeValue(el, value);
  };
  if (firstName && setByName("firstName", firstName)) n++;
  if (lastName && setByName("lastName", lastName)) n++;

  const cpf = cpfDigitsOnly(pax.cpf);
  if (cpf) {
    const cpfEl = document.querySelector(
      `input[name="passenger-${i}_documentNumber"], input[name="passenger-${i}_cpf"], input[name*="passenger-${i}_"][name*="document" i]`
    );
    if (cpfEl) {
      const cur = String(cpfEl.value || "").replace(/\D/g, "");
      if (cur !== cpf) {
        setNativeValue(cpfEl, "");
        setNativeValue(cpfEl, cpf);
        n++;
      }
    }
  }

  const root = sec?.root || document.body;
  const dobEl = document.querySelector(
    `input[name="passenger-${i}_dateOfBirth"]`
  );
  if (!dobEl || !birthFieldHasDate(dobEl)) {
    n += await fillBirthDate(root, pax, i);
  }

  const gender = resolvePaxGender(pax);
  if (gender) {
    const sexEl =
      document.querySelector(
        `input[name="passenger-${i}_gender"], select[name="passenger-${i}_gender"], [data-testid*="passenger-${i}_gender" i]`
      ) || findFieldByWord(root, ["sexo"]);
    if (!genderFieldShows(sexEl, gender)) {
      if (await selectGender(root, gender, i)) n++;
    }
  }

  closeOpenMenus();
  await sleep(200);
  return n;
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

/** Preenche um pax completo com a ficha aberta (nome → fecha popover → data). */
async function fillOnePassengerComplete(i, pax) {
  let n = 0;
  const opened = await ensurePassengerExpanded(i);
  const root = opened.root;

  const { firstName, lastName } = splitPassengerName(pax);
  const setByName = (suffix, value) => {
    if (!value) return false;
    const el = document.querySelector(
      `input[name="passenger-${i}_${suffix}"], input[data-testid*="passenger-${i}_${suffix}" i]`
    );
    return el ? setNativeValue(el, value) : false;
  };

  if (firstName && setByName("firstName", firstName)) n++;
  await dismissSavedPassengersPopover();
  if (lastName && setByName("lastName", lastName)) n++;
  await dismissSavedPassengersPopover();

  const cpf = cpfDigitsOnly(pax.cpf);
  if (cpf) {
    const cpfEl = document.querySelector(
      `input[name="passenger-${i}_documentNumber"], input[name="passenger-${i}_cpf"], input[name*="passenger-${i}_"][name*="document" i], input[name*="passenger-${i}_"][name*="cpf" i]`
    );
    if (cpfEl) {
      setNativeValue(cpfEl, "");
      setNativeValue(cpfEl, cpf);
      n++;
    }
  }

  n += fillInSection(root, pax, "adult");
  await dismissSavedPassengersPopover();

  const gender = resolvePaxGender(pax);
  if (gender && (await selectGender(root, gender, i))) n++;
  closeOpenMenus();
  await sleep(120);

  // Data NA MESMA ficha aberta — sem clicar fora / body
  n += await fillBirthDate(root, pax, i);
  let dobEl = findPassengerDobInput(i, root);
  if (!dobEl || !birthFieldHasDate(dobEl)) {
    await ensurePassengerExpanded(i);
    await sleep(300);
    n += await fillBirthDate(passengerRoot(i), pax, i);
  }

  await sleep(200);
  return n;
}

async function fillAll(passengers) {
  let total = 0;
  const max = passengers.length;

  const titularEmail =
    passengers.find((p) => p.email)?.email || null;
  const titularPhone =
    passengers.find((p) => p.phone)?.phone || null;
  const enriched = passengers.map((p) => ({
    ...p,
    email: p.email || titularEmail,
    phone: p.phone || titularPhone,
  }));

  // Um pax por vez: abre ficha → preenche tudo (inclui data) → próximo
  for (let i = 0; i < max; i++) {
    await dismissSavedPassengersPopover();
    await sleep(120);
    total += await fillOnePassengerComplete(i, enriched[i]);
  }

  // Com 2+ pax: reabre quem ficou sem data
  if (max > 1) {
    for (let i = 0; i < max; i++) {
      const dobEl = findPassengerDobInput(i, document.body);
      if (dobEl && birthFieldHasDate(dobEl)) continue;
      await dismissSavedPassengersPopover();
      await ensurePassengerExpanded(i);
      await sleep(250);
      total += await fillBirthDate(passengerRoot(i), enriched[i], i);
    }
  }

  await dismissSavedPassengersPopover();

  // Contato global no fim
  if (titularEmail) {
    const emailEl = findFieldByWord(document.body, ["email", "e-mail"]);
    if (emailEl) setNativeValue(emailEl, String(titularEmail).toLowerCase());
  }
  if (titularPhone) {
    const phone = String(titularPhone).replace(/\D/g, "").replace(/^55/, "");
    const phoneEl = findFieldByWord(
      document.body,
      ["numero", "telefone", "celular"],
      { excludeWords: ["documento", "passageiro frequente", "cartao", "cartão"] }
    );
    if (phoneEl) setNativeValue(phoneEl, phone);
  }

  return { sections: max, fields: total };
}

async function runFill({ manual } = {}) {
  ensureFab();
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

  let result = await fillAll(passengers);
  if (result.fields < 3) {
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
  if (ok && badCpfs.length) {
    showToast(
      `TradeMiles: preenchido, mas CPF incorreto em ${badCpfs.length} pax — confira na LATAM.`,
      false
    );
  } else {
    showToast(
      ok
        ? `TradeMiles: ${result.fields} campo(s) · ${passengers.length} pax. Revise.`
        : "TradeMiles: não achou os campos. Clique de novo em Preencher TradeMiles.",
      ok
    );
  }
  console.info("[TradeMiles] fill", { manual, result, passengers, badCpfs });
  return { ok, ...result, passengers: passengers.length };
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
