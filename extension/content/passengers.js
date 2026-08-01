/**
 * Passageiros LATAM — /v2/passageiros e /pagamentos/passageiros
 * Botão flutuante + preenchimento agressivo (React).
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
  // React controlled inputs
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
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: str, inputType: "insertText" }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
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

function isVisible(el) {
  if (!el) return false;
  const st = window.getComputedStyle(el);
  if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function detectDateSep() {
  const ph = Array.from(document.querySelectorAll("input"))
    .map((i) => (i.placeholder || "").toLowerCase())
    .find((p) => p.includes("dd") && p.includes("mm"));
  if (ph && ph.includes("/")) return "/";
  if (ph && ph.includes("-")) return "-";
  if (/\/v2\/passageiros/i.test(location.pathname)) return "/";
  return "/";
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
    el.getAttribute("data-testid"),
    el.getAttribute("autocomplete"),
  ];
  if (el.labels?.[0]) bits.push(textOf(el.labels[0]));
  let p = el.parentElement;
  for (let i = 0; i < 5 && p; i++) {
    const lab = p.querySelector?.(":scope > label, :scope > span, :scope > p, legend");
    if (lab) bits.push(textOf(lab));
    // irmão anterior com label
    const prev = p.previousElementSibling;
    if (prev && /label|span|p|div/i.test(prev.tagName)) bits.push(textOf(prev));
    p = p.parentElement;
  }
  return normalizeLabel(bits.filter(Boolean).join(" | "));
}

function findField(root, needles) {
  const ns = (Array.isArray(needles) ? needles : [needles]).map(normalizeLabel);
  const inputs = [
    ...root.querySelectorAll(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea"
    ),
  ].filter(isVisible);

  for (const el of inputs) {
    const meta = fieldMeta(el);
    if (ns.some((n) => meta.includes(n))) return el;
  }
  return null;
}

function visibleTextInputs(root) {
  return [
    ...root.querySelectorAll(
      'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])'
    ),
  ].filter(isVisible);
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

function fillByLabels(root, pax, kind) {
  let n = 0;
  const birth = toLatamDate(pax);
  const cpf = pax.cpf ? String(pax.cpf).replace(/\D/g, "") : null;

  if (pax.firstName && setNativeValue(findField(root, ["nome"]), pax.firstName)) n++;
  if (pax.lastName && setNativeValue(findField(root, ["sobrenome"]), pax.lastName)) n++;
  if (birth) {
    const el =
      findField(root, ["data de nascimento", "nascimento"]) ||
      root.querySelector('input[placeholder*="dd" i]');
    if (setNativeValue(el, birth)) n++;
  }
  selectGender(root, pax.gender);
  if (cpf && setNativeValue(findField(root, ["cpf"]), cpf)) n++;
  if ((kind === "child" || kind === "infant") && cpf) {
    setNativeValue(
      findField(root, ["numero de documento", "n de documento", "documento"]),
      cpf
    );
  }
  if (pax.email && setNativeValue(findField(root, ["email", "e-mail"]), pax.email)) n++;
  if (pax.phone) {
    const phone = String(pax.phone).replace(/\D/g, "").replace(/^55/, "");
    if (
      setNativeValue(findField(root, ["numero", "telefone", "celular"]), phone)
    ) {
      n++;
    }
  }
  return n;
}

/** Fallback: ordem típica dos inputs no card Adulto. */
function fillByOrder(root, pax) {
  const inputs = visibleTextInputs(root);
  if (inputs.length < 2) return 0;
  let n = 0;
  const birth = toLatamDate(pax);
  const cpf = pax.cpf ? String(pax.cpf).replace(/\D/g, "") : null;
  const phone = pax.phone
    ? String(pax.phone).replace(/\D/g, "").replace(/^55/, "")
    : null;

  // Heurística: primeiro texto sem placeholder de data = nome
  const nonDate = inputs.filter(
    (i) => !/dd|mm|aaaa|yyyy/i.test(i.placeholder || "")
  );
  const dateInput =
    inputs.find((i) => /dd|mm|aaaa|yyyy/i.test(i.placeholder || "")) || null;

  if (pax.firstName && nonDate[0] && setNativeValue(nonDate[0], pax.firstName)) n++;
  if (pax.lastName && nonDate[1] && setNativeValue(nonDate[1], pax.lastName)) n++;
  if (birth && dateInput && setNativeValue(dateInput, birth)) n++;

  // CPF: input com maxLength 11/14 ou meta cpf
  const cpfEl =
    findField(root, ["cpf"]) ||
    inputs.find((i) => String(i.maxLength) === "11" || String(i.maxLength) === "14");
  if (cpf && cpfEl && setNativeValue(cpfEl, cpf)) n++;

  const emailEl =
    findField(root, ["email"]) ||
    inputs.find((i) => i.type === "email" || /@|email/i.test(i.name || i.id || ""));
  if (pax.email && emailEl && setNativeValue(emailEl, pax.email)) n++;

  const phoneEl = findField(root, ["numero", "telefone"]);
  if (phone && phoneEl && setNativeValue(phoneEl, phone)) n++;

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
    let filled = fillByLabels(sec.root, passengers[i], sec.kind);
    if (filled < 2) filled = Math.max(filled, fillByOrder(sec.root, passengers[i]));
    total += filled;
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

  // espera form aparecer
  for (let attempt = 0; attempt < 8; attempt++) {
    const inputs = visibleTextInputs(document.body);
    if (inputs.length >= 2) break;
    await sleep(400);
  }

  let result = await fillAll(passengers);
  if (result.fields < 2) {
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
  console.info("[TradeMiles] fill", { manual, result, passengers, payload: res.data });
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
// Auto + retries (SPA)
runFill({ manual: false }).catch((e) => console.warn("[TradeMiles]", e));
setTimeout(() => void runFill({ manual: false }), 2000);
setTimeout(() => void runFill({ manual: false }), 4500);
