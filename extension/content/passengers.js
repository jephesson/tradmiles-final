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

function fillBirthSplit(root, pax) {
  const parts = birthParts(pax);
  if (!parts) return 0;

  // Container da data de nascimento
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

  const inputs = visibleTextInputs(container);
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

  // Três inputs curtos na ordem dia/mês/ano
  const shorties = inputs.filter(
    (i) =>
      i.maxLength === 2 ||
      i.maxLength === 4 ||
      /dd|mm|aa|ano|dia|mes/i.test(i.placeholder || "") ||
      i.inputMode === "numeric"
  );

  let n = 0;
  if (dayEl && monthEl && yearEl) {
    if (setNativeValue(dayEl, parts.day)) n++;
    if (setNativeValue(monthEl, parts.month)) n++;
    if (setNativeValue(yearEl, parts.year)) n++;
    return n;
  }

  if (shorties.length >= 3) {
    // ordena da esquerda pra direita
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
    if (y && setNativeValue(y, parts.year.length === 4 && y.maxLength === 2 ? parts.year.slice(-2) : parts.year)) {
      n++;
    }
    return n;
  }

  // Fallback: um campo só (layout antigo)
  const single =
    findFieldByWord(root, ["data de nascimento", "nascimento"]) ||
    root.querySelector('input[placeholder*="dd" i]');
  if (single && shorties.length < 3) {
    const joined = `${parts.day}/${parts.month}/${parts.year}`;
    if (setNativeValue(single, joined)) return 1;
  }
  return n;
}

function selectGender(root, gender) {
  if (!gender) return;
  const label = gender === "F" ? "Feminino" : "Masculino";
  const el = findFieldByWord(root, ["sexo"]);
  if (!el) return;
  if (el.tagName === "SELECT") {
    setNativeValue(el, label);
    return;
  }
  el.click?.();
  setTimeout(() => {
    const hit = Array.from(
      document.querySelectorAll('[role="option"], li, button, span, div')
    ).find((o) => normalizeLabel(textOf(o)) === normalizeLabel(label));
    hit?.click?.();
  }, 180);
}

function findPassengerSections() {
  const found = [];
  const seen = new Set();
  const headers = Array.from(
    document.querySelectorAll("h1, h2, h3, h4, h5, button, div, span, strong, p")
  );

  for (const el of headers) {
    const t = textOf(el);
    if (!/^(Adulto|Criança|Crianca|Bebê|Bebe)\b/i.test(t) || t.length > 36) continue;

    let root = el.parentElement;
    for (let i = 0; i < 10 && root; i++) {
      if (visibleTextInputs(root).length >= 3) break;
      root = root.parentElement;
    }
    if (!root || seen.has(root)) continue;
    seen.add(root);

    const kindRaw = t
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    let kind = "adult";
    if (kindRaw.startsWith("crianca")) kind = "child";
    else if (kindRaw.startsWith("bebe")) kind = "infant";
    found.push({ kind, root, header: el });
  }

  if (!found.length) {
    found.push({ kind: "adult", root: document.body, header: null });
  }
  return found;
}

function fillInSection(root, pax, kind) {
  let n = 0;
  const { firstName, lastName } = splitPassengerName(pax);
  const cpf = pax.cpf ? String(pax.cpf).replace(/\D/g, "") : null;

  const nomeEl = findFirstNameField(root);
  const sobEl = findLastNameField(root);
  if (firstName && setNativeValue(nomeEl, firstName)) n++;
  if (lastName && setNativeValue(sobEl, lastName)) n++;

  n += fillBirthSplit(root, pax);
  selectGender(root, pax.gender || (firstName.endsWith("a") ? "F" : null));

  if (cpf && setNativeValue(findFieldByWord(root, ["cpf"]), cpf)) n++;
  if ((kind === "child" || kind === "infant") && cpf) {
    setNativeValue(
      findFieldByWord(root, ["numero de documento", "n de documento"]),
      cpf
    );
  }

  if (pax.email) {
    const email = String(pax.email).trim().toLowerCase();
    if (setNativeValue(findFieldByWord(root, ["email", "e-mail"]), email)) n++;
  }
  if (pax.phone) {
    const phone = String(pax.phone).replace(/\D/g, "").replace(/^55/, "");
    if (
      setNativeValue(
        findFieldByWord(root, ["numero", "telefone", "celular"], {
          excludeWords: ["documento", "passageiro frequente", "cartao"],
        }),
        phone
      )
    ) {
      n++;
    }
  }
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
  const sections = findPassengerSections();
  const n = Math.min(sections.length, passengers.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const sec = sections[i];
    try {
      sec.header?.scrollIntoView?.({ block: "center" });
      sec.header?.click?.();
    } catch {
      /* ignore */
    }
    await sleep(300);
    total += fillInSection(sec.root, passengers[i], sec.kind);
    await sleep(200);
  }
  return { sections: n, fields: total };
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

  const ok = result.fields > 0;
  showToast(
    ok
      ? `TradeMiles: ${result.fields} campo(s) · ${passengers.length} pax. Revise.`
      : "TradeMiles: não achou os campos. Clique de novo em Preencher TradeMiles.",
    ok
  );
  console.info("[TradeMiles] fill", { manual, result, passengers });
  return { ok, ...result, passengers: passengers.length };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "TM_RUN_FILL") {
    runFill({ manual: true }).then(sendResponse);
    return true;
  }
  return false;
});

ensureFab();
runFill({ manual: false }).catch((e) => console.warn("[TradeMiles]", e));
setTimeout(() => void runFill({ manual: false }), 2000);
