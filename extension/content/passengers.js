/**
 * Passageiros LATAM — layouts:
 * - /pagamentos/passageiros
 * - /v2/passageiros
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
  if (setter) setter.call(el, String(value));
  else el.value = String(value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
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

function detectDateSep() {
  const ph = Array.from(document.querySelectorAll("input"))
    .map((i) => (i.placeholder || "").toLowerCase())
    .find((p) => p.includes("dd") && p.includes("mm"));
  if (ph && ph.includes("/")) return "/";
  if (ph && ph.includes("-")) return "-";
  if (/\/v2\/passageiros/i.test(location.pathname)) return "/";
  return "-";
}

function toLatamDate(pax) {
  const sep = detectDateSep();
  let d;
  let m;
  let y;
  if (pax.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(pax.birthDate)) {
    [y, m, d] = pax.birthDate.split("-");
  } else if (pax.birthDateBR) {
    const parts = String(pax.birthDateBR).split(/[\/\-.]/);
    if (parts.length === 3) [d, m, y] = parts;
  } else if (pax.birthDateLatam) {
    const parts = String(pax.birthDateLatam).split(/[\/\-.]/);
    if (parts.length === 3) [d, m, y] = parts;
  }
  if (!d || !m || !y) return null;
  return `${d}${sep}${m}${sep}${y}`;
}

function fieldMeta(el) {
  const bits = [
    el.getAttribute("aria-label"),
    el.getAttribute("name"),
    el.getAttribute("placeholder"),
    el.getAttribute("id"),
    el.getAttribute("data-test"),
    el.getAttribute("autocomplete"),
  ];
  const label = el.labels && el.labels[0] ? textOf(el.labels[0]) : "";
  bits.push(label);
  // label próximo (floating)
  let p = el.parentElement;
  for (let i = 0; i < 4 && p; i++) {
    const lab = p.querySelector?.("label, legend, span, p");
    if (lab) bits.push(textOf(lab));
    p = p.parentElement;
  }
  return normalizeLabel(bits.filter(Boolean).join(" "));
}

function findField(root, needles, { exact = false } = {}) {
  const ns = (Array.isArray(needles) ? needles : [needles]).map(normalizeLabel);
  const inputs = root.querySelectorAll(
    "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea"
  );
  for (const el of inputs) {
    const meta = fieldMeta(el);
    if (!meta) continue;
    const ok = ns.some((n) =>
      exact ? meta === n || meta.startsWith(`${n} `) : meta.includes(n)
    );
    if (ok) return el;
  }

  // fallback por texto de label no DOM
  const nodes = root.querySelectorAll("label, span, p, legend");
  for (const node of nodes) {
    const t = normalizeLabel(textOf(node));
    if (!t || t.length > 80) continue;
    if (!ns.some((n) => (exact ? t === n : t === n || t.startsWith(`${n} `)))) {
      continue;
    }
    const forId = node.getAttribute?.("for");
    if (forId) {
      const byFor = document.getElementById(forId);
      if (byFor) return byFor;
    }
    let cur = node;
    for (let i = 0; i < 5 && cur; i++) {
      const input = cur.querySelector?.(
        "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea"
      );
      if (input) return input;
      cur = cur.parentElement;
    }
  }
  return null;
}

function selectGender(root, gender) {
  if (!gender) return;
  const label = gender === "F" ? "Feminino" : "Masculino";
  const el = findField(root, ["sexo"]);
  if (!el) return;
  if (el.tagName === "SELECT") {
    setNativeValue(el, label);
    return;
  }
  el.click?.();
  setTimeout(() => {
    const opts = Array.from(
      document.querySelectorAll('[role="option"], li, button, span')
    );
    const hit = opts.find((o) => textOf(o).toLowerCase() === label.toLowerCase());
    hit?.click?.();
  }, 150);
}

function findPassengerSections() {
  const candidates = Array.from(
    document.querySelectorAll("h1, h2, h3, h4, h5, button, div, span, strong")
  );
  const found = [];
  const seen = new Set();

  for (const el of candidates) {
    const t = textOf(el);
    if (!/^(Adulto|Criança|Crianca|Bebê|Bebe)\b/i.test(t)) continue;
    if (t.length > 40) continue;

    // sobe até um container com vários inputs
    let root = el.parentElement;
    for (let i = 0; i < 8 && root; i++) {
      const inputs = root.querySelectorAll(
        "input:not([type=hidden]):not([type=checkbox]):not([type=radio])"
      );
      if (inputs.length >= 3) break;
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

function fillInSection(section, pax) {
  const root = section.root;
  const birth = toLatamDate(pax);
  const cpf = pax.cpf ? String(pax.cpf).replace(/\D/g, "") : null;
  let filled = 0;

  if (pax.firstName) {
    const el =
      findField(root, ["nome"], { exact: true }) ||
      findField(root, ["given-name", "first name", "firstname"]);
    if (setNativeValue(el, pax.firstName)) filled++;
  }
  if (pax.lastName) {
    const el =
      findField(root, ["sobrenome"], { exact: true }) ||
      findField(root, ["family-name", "last name", "lastname"]);
    if (setNativeValue(el, pax.lastName)) filled++;
  }
  if (birth) {
    const el =
      findField(root, ["data de nascimento"]) ||
      root.querySelector('input[placeholder*="dd"]');
    if (setNativeValue(el, birth)) filled++;
  }

  selectGender(root, pax.gender);

  if (cpf) {
    if (setNativeValue(findField(root, ["cpf"], { exact: true }), cpf)) filled++;
    if (section.kind === "child" || section.kind === "infant") {
      setNativeValue(
        findField(root, ["numero de documento", "n de documento", "documento"]),
        cpf
      );
    }
  }

  if (pax.email) {
    if (setNativeValue(findField(root, ["email", "e-mail"]), pax.email)) filled++;
  }
  if (pax.phone) {
    const phone = String(pax.phone).replace(/\D/g, "").replace(/^55/, "");
    if (setNativeValue(findField(root, ["numero"], { exact: true }), phone)) {
      filled++;
    } else {
      setNativeValue(findField(root, ["número", "telefone", "celular"]), phone);
    }
  }

  return filled;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fillAll(passengers) {
  const sections = findPassengerSections();
  const n = Math.min(sections.length, passengers.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    try {
      sections[i].header?.scrollIntoView?.({ block: "center" });
      sections[i].header?.click?.();
    } catch {
      /* ignore */
    }
    await sleep(250);
    total += fillInSection(sections[i], passengers[i]);
    await sleep(200);
  }
  return { sections: n, fields: total };
}

async function runFill() {
  const res = await chrome.runtime.sendMessage({ type: "TM_GET_FILL_PAYLOAD" });
  if (!res?.ok) {
    console.warn("[TradeMiles]", res?.error || "Sem payload.");
    return { ok: false, error: res?.error || "Sem payload" };
  }
  if (!res.data?.useExtension) {
    console.warn("[TradeMiles] Extensão desligada na venda.");
    return { ok: false, error: "Extensão desligada na venda (Preparar extensão)." };
  }
  const passengers = Array.isArray(res.data.passengers) ? res.data.passengers : [];
  if (!passengers.length) {
    return { ok: false, error: "Nenhum passageiro na sessão." };
  }

  await sleep(400);
  let result = await fillAll(passengers);

  // SPA: tenta de novo se quase nada preencheu
  if (result.fields < 2) {
    await sleep(1200);
    result = await fillAll(passengers);
  }

  console.info("[TradeMiles] Fill:", result, passengers);
  return { ok: result.fields > 0, ...result, passengers: passengers.length };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "TM_RUN_FILL") {
    runFill().then(sendResponse);
    return true;
  }
  return false;
});

// Auto ao abrir a página
runFill().catch((e) => console.warn("[TradeMiles]", e));
