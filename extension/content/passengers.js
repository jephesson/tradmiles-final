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
  return {
    day: String(Number(d)).padStart(2, "0"),
    month: String(Number(m)).padStart(2, "0"),
    year: String(y).length === 2 ? `20${y}` : String(y),
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
  const byTestId = [
    ...root.querySelectorAll(
      'input[type="date"][name*="dateOfBirth" i], input[type="date"][data-testid*="dateOfBirth" i], input[data-testid*="dateOfBirth" i], input[name*="dateOfBirth" i]'
    ),
  ].find(isVisible);
  if (byTestId) return byTestId;

  const byType = [...root.querySelectorAll('input[type="date"]')].find((el) => {
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
    findFieldByWord(root, ["data de nascimento", "nascimento"], {
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
    await sleep(30);
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

/**
 * Data de nascimento LATAM:
 * - type=date → YYYY-MM-DD
 * - máscara texto → digita 8 dígitos (ddmmaaaa), como no pagamento
 */
async function fillBirthDate(root, pax, passengerIndex) {
  const parts = birthParts(pax);
  if (!parts) return 0;

  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  const digits = `${parts.day}${parts.month}${parts.year}`;
  const pretty = `${parts.day}/${parts.month}/${parts.year}`;
  const spaced = `${parts.day} / ${parts.month} / ${parts.year}`;

  let el = null;
  if (passengerIndex != null && passengerIndex >= 0) {
    el = document.querySelector(
      `input[name="passenger-${passengerIndex}_dateOfBirth"], ` +
        `input[data-testid*="passenger-${passengerIndex}_dateOfBirth" i]`
    );
  }
  if (!el || !isVisible(el)) el = findDateOfBirthInput(root);

  if (!el) {
    const split = fillBirthSplitFields(root, parts);
    return split > 0 ? split : 0;
  }

  el.scrollIntoView?.({ block: "center", inline: "nearest" });
  el.focus?.();
  el.click?.();
  await sleep(80);

  // Só ISO em input type="date" nativo
  if (el.type === "date") {
    if (fillNativeDateInput(el, parts)) {
      await sleep(80);
      // Reaplica — React LATAM às vezes limpa no 1º set
      if (!birthFieldHasDate(el) || el.value !== iso) {
        fillNativeDateInput(el, parts);
        await sleep(80);
      }
      if (birthFieldHasDate(el)) return 1;
    }
  }

  // Máscara React (texto): digitar só dígitos — NÃO colocar ISO aqui
  await typeChars(el, digits);
  await sleep(120);
  if (birthFieldHasDate(el)) return 1;

  // Formato com espaços (igual cobrança)
  await typeChars(el, spaced.replace(/\s+/g, ""));
  await sleep(100);
  if (birthFieldHasDate(el)) return 1;

  setNativeValue(el, pretty);
  await sleep(80);
  if (birthFieldHasDate(el)) return 1;

  setNativeValue(el, spaced);
  await sleep(80);
  if (birthFieldHasDate(el)) return 1;

  // Digitação lenta
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  if (setter) setter.call(el, "");
  else el.value = "";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  let cur = "";
  for (const ch of digits) {
    cur += ch;
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
      new KeyboardEvent("keydown", { key: ch, bubbles: true })
    );
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: ch,
        inputType: "insertText",
      })
    );
    el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
    await sleep(55);
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  await sleep(100);

  if (birthFieldHasDate(el)) return 1;

  // Último recurso: type=date ISO se o name for dateOfBirth
  if (/dateofbirth/i.test(el.name || el.id || el.getAttribute("data-testid") || "")) {
    if (fillNativeDateInput(el, parts)) return 1;
    if (setNativeValue(el, iso) && birthFieldHasDate(el)) return 1;
  }

  console.warn("[TradeMiles] Data de nascimento não grudou:", {
    value: el.value,
    type: el.type,
    name: el.name,
    iso,
    pretty,
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
  ]);
  if (female.has(first)) return "F";
  if (male.has(first)) return "M";
  if (first.endsWith("a")) return "F";
  if (first.endsWith("o")) return "M";
  return null;
}

function closeOpenMenus() {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  );
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
  );
}

async function selectGender(root, gender) {
  if (!gender) return false;
  const label = gender === "F" ? "Feminino" : "Masculino";
  const el = findFieldByWord(root, ["sexo"]);
  if (!el) return false;
  if (el.tagName === "SELECT") {
    return setNativeValue(el, label);
  }

  closeOpenMenus();
  await sleep(80);

  el.focus?.();
  el.click?.();
  await sleep(280);

  const hit = Array.from(
    document.querySelectorAll(
      '[role="option"], li[role="option"], [role="listbox"] li, ul li, button, span, div'
    )
  ).find((o) => {
    if (!isVisible(o)) return false;
    const t = normalizeLabel(textOf(o));
    return t === normalizeLabel(label) || t === (gender === "F" ? "f" : "m");
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
  return Boolean(hit) || Boolean(el.value || textOf(el));
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

async function expandPassengerSection(sec) {
  if (!sec) return;

  // Garante que o marcador do índice exista / esteja no DOM
  const idx = sec.index;
  if (typeof idx === "number") {
    const adultBtns = Array.from(
      document.querySelectorAll("button, [role='button'], [aria-expanded]")
    ).filter((b) => /^(Adulto|Criança|Crianca|Bebê|Bebe)\b/i.test(textOf(b)));
    const byOrder = adultBtns[idx];
    if (byOrder) sec.header = byOrder;
  }

  const header = sec.header;
  if (header) {
    try {
      header.scrollIntoView?.({ block: "center", behavior: "instant" });
    } catch {
      header.scrollIntoView?.({ block: "center" });
    }

    const ariaOpen = header.getAttribute?.("aria-expanded") === "true";
    const hasFields =
      visibleTextInputs(sec.root).length >= 2 ||
      Boolean(
        document.querySelector(
          `input[name="passenger-${idx}_dateOfBirth"], input[name^="passenger-${idx}_"]`
        )
      );

    if (!ariaOpen || !hasFields) {
      header.click?.();
      await sleep(500);
    }
  }

  // Atualiza root para o bloco que contém os inputs deste índice
  if (typeof idx === "number") {
    const marker = document.querySelector(
      `input[name="passenger-${idx}_dateOfBirth"], input[name^="passenger-${idx}_"], [data-testid*="passenger-${idx}_" i]`
    );
    if (marker) {
      let root = marker.parentElement;
      for (let i = 0; i < 10 && root; i++) {
        const onlyThis =
          root.querySelector(`input[name^="passenger-${idx}_"]`) &&
          !root.querySelector(`input[name^="passenger-${idx + 1}_"]`);
        if (onlyThis && visibleTextInputs(root).length >= 1) {
          sec.root = root;
          break;
        }
        root = root.parentElement;
      }
      if (marker.closest) {
        const card = marker.closest("section, article, li, div");
        if (card && !card.querySelector(`input[name^="passenger-${idx + 1}_"]`)) {
          sec.root = card;
        }
      }
    }
  }

  for (let i = 0; i < 12; i++) {
    const ready =
      visibleTextInputs(sec.root).length >= 2 ||
      Boolean(
        document.querySelector(
          `input[name="passenger-${idx}_dateOfBirth"], input[name^="passenger-${idx}_firstName"], input[name^="passenger-${idx}_"]`
        )
      );
    if (ready) break;
    if (header && i === 3) header.click?.();
    await sleep(180);
  }
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

async function fillInSectionAsync(root, pax, kind, passengerIndex) {
  let n = fillInSection(root, pax, kind);
  n += await fillBirthDate(root, pax, passengerIndex);

  const { firstName } = splitPassengerName(pax);
  const gender =
    pax.gender === "F" || pax.gender === "M"
      ? pax.gender
      : guessGenderFromName(firstName);
  if (gender && (await selectGender(root, gender))) n++;

  if (pax.email) {
    const email = String(pax.email).trim().toLowerCase();
    const emailEl =
      findFieldByWord(root, ["email", "e-mail"]) ||
      findFieldByWord(document.body, ["email", "e-mail"]);
    if (emailEl && setNativeValue(emailEl, email)) n++;
  }
  if (pax.phone) {
    const phone = String(pax.phone).replace(/\D/g, "").replace(/^55/, "");
    const phoneEl =
      findFieldByWord(root, ["numero", "telefone", "celular"], {
        excludeWords: ["documento", "passageiro frequente", "cartao"],
      }) ||
      findFieldByWord(document.body, ["numero", "telefone", "celular"], {
        excludeWords: ["documento", "passageiro frequente", "cartao", "cartão"],
      });
    if (phoneEl && setNativeValue(phoneEl, phone)) n++;
  }

  closeOpenMenus();
  await sleep(150);
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

async function fillAll(passengers) {
  let total = 0;
  let filled = 0;
  const max = passengers.length;

  // Prefill contato do titular em todos os pax da sessão
  const titularEmail =
    passengers.find((p) => p.email)?.email || null;
  const titularPhone =
    passengers.find((p) => p.phone)?.phone || null;
  const enriched = passengers.map((p) => ({
    ...p,
    email: p.email || titularEmail,
    phone: p.phone || titularPhone,
  }));

  for (let i = 0; i < max; i++) {
    closeOpenMenus();
    await sleep(120);

    const sections = findPassengerSections(max);
    const sec = sections.find((s) => s.index === i) || sections[i];
    if (!sec) {
      console.warn("[TradeMiles] Sem slot para pax", i);
      continue;
    }

    await expandPassengerSection(sec);

    // Preenche pelos name=passenger-i_* no documento (mais estável)
    const scopedRoot =
      document.querySelector(
        `[data-testid*="passenger-${i}" i], [id*="passenger-${i}" i]`
      ) || sec.root;

    let root = scopedRoot;
    const marker = document.querySelector(`input[name^="passenger-${i}_"]`);
    if (marker) {
      let r = marker.parentElement;
      for (let up = 0; up < 12 && r; up++) {
        if (
          r.querySelector(`input[name^="passenger-${i}_"]`) &&
          !r.querySelector(`input[name^="passenger-${i + 1}_"]`)
        ) {
          root = r;
          break;
        }
        r = r.parentElement;
      }
    }

    // Preenche também pelos name= exatos da LATAM (mais estável)
    const pax = enriched[i];
    const { firstName, lastName } = splitPassengerName(pax);
    const setByName = (suffix, value) => {
      if (!value) return false;
      const el = document.querySelector(
        `input[name="passenger-${i}_${suffix}"], input[data-testid*="passenger-${i}_${suffix}" i]`
      );
      return el ? setNativeValue(el, value) : false;
    };
    if (firstName) setByName("firstName", firstName);
    if (lastName) setByName("lastName", lastName);
    const cpf = cpfDigitsOnly(pax.cpf);
    if (cpf) {
      const cpfEl = document.querySelector(
        `input[name="passenger-${i}_documentNumber"], input[name="passenger-${i}_cpf"], input[name*="passenger-${i}_"][name*="document" i], input[name*="passenger-${i}_"][name*="cpf" i]`
      );
      if (cpfEl) {
        setNativeValue(cpfEl, "");
        setNativeValue(cpfEl, cpf);
      }
    }

    total += await fillInSectionAsync(root, pax, sec.kind, i);
    filled++;
    closeOpenMenus();
    await sleep(300);
  }

  // Contato global da reserva
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

  return { sections: filled, fields: total };
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
