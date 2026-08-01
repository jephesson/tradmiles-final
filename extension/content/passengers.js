/**
 * Content script — passageiros LATAM (dois layouts):
 *
 * A) /br/pt/pagamentos/passageiros?orderId=…  (data dd-mm-aaaa, Nacionalidade)
 * B) /br/pt/v2/passageiros?orderId=…         (data dd/mm/aaaa, País de emissão)
 *    → sem botão "Confirmar dados"; só preenche e o Continuar segue
 *
 * Criança/Bebê com CPF → CPF + Nº de documento (mesmo valor).
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
  if (setter) setter.call(el, String(value));
  else el.value = String(value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
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

/** Layout v2 usa dd/mm/aaaa; layout antigo dd-mm-aaaa. */
function detectDateSep() {
  const ph = Array.from(document.querySelectorAll("input"))
    .map((i) => (i.placeholder || "").toLowerCase())
    .find((p) => p.includes("dd") && p.includes("mm"));
  if (ph && ph.includes("/")) return "/";
  if (ph && ph.includes("-")) return "-";
  // URL hint
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

function findField(root, labelNeedles, { exact = false } = {}) {
  const needles = (Array.isArray(labelNeedles) ? labelNeedles : [labelNeedles]).map(
    (n) => normalizeLabel(n)
  );
  const nodes = root.querySelectorAll("label, span, p, legend, div");
  for (const node of nodes) {
    const t = normalizeLabel(textOf(node));
    if (!t || t.length > 100) continue;
    const ok = needles.some((n) => (exact ? t === n : t === n || t.startsWith(`${n} `)));
    if (!ok) continue;

    const forId = node.getAttribute?.("for");
    if (forId) {
      const byFor =
        root.querySelector(`#${CSS.escape(forId)}`) || document.getElementById(forId);
      if (byFor) {
        if (byFor.matches("input, select, textarea")) return byFor;
        const inner = byFor.querySelector?.("input, select, textarea");
        if (inner) return inner;
      }
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
  }, 120);
}

function setCheckboxIfPresent(root, labelNeedle, checked) {
  const nodes = root.querySelectorAll("label, span");
  for (const node of nodes) {
    if (!normalizeLabel(textOf(node)).includes(normalizeLabel(labelNeedle))) continue;
    const box =
      node.querySelector('input[type="checkbox"]') ||
      node.parentElement?.querySelector('input[type="checkbox"]');
    if (box && box.checked !== checked) {
      box.click();
      return true;
    }
  }
  return false;
}

function clickConfirmIfPresent(root) {
  const buttons = Array.from(root.querySelectorAll("button, a[role='button']"));
  const btn = buttons.find((b) => /confirmar dados/i.test(textOf(b)));
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}

function expandSection(headerEl) {
  if (!headerEl) return;
  const btn =
    headerEl.closest("button") ||
    headerEl.querySelector("button") ||
    headerEl;
  try {
    btn.click?.();
  } catch {
    /* ignore */
  }
}

function findPassengerSections() {
  const headers = Array.from(
    document.querySelectorAll("h1, h2, h3, h4, button, div, span")
  );
  const found = [];
  const seen = new Set();

  for (const el of headers) {
    const t = textOf(el);
    const m = t.match(/^(Adulto|Criança|Crianca|Bebê|Bebe)\b/i);
    if (!m) continue;
    const section =
      el.closest("[class*='passenger'], [class*='Passenger'], section, form, article") ||
      el.closest("div");
    if (!section || seen.has(section)) continue;
    seen.add(section);

    const kindRaw = m[1]
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    let kind = "adult";
    if (kindRaw.startsWith("crianca")) kind = "child";
    else if (kindRaw.startsWith("bebe")) kind = "infant";

    found.push({ kind, root: section, header: el });
  }

  if (!found.length) {
    found.push({ kind: "adult", root: document.body, header: null });
  }
  return found;
}

function fillInSection(section, pax, { isFirst, isLast }) {
  const root = section.root;
  expandSection(section.header);

  const birth = toLatamDate(pax);
  const cpf = pax.cpf ? String(pax.cpf).replace(/\D/g, "") : null;

  if (pax.firstName) {
    const nome =
      findField(root, ["nome"], { exact: true }) ||
      root.querySelector('input[autocomplete="given-name"]');
    setNativeValue(nome, pax.firstName);
  }
  if (pax.lastName) {
    const sob =
      findField(root, ["sobrenome"], { exact: true }) ||
      root.querySelector('input[autocomplete="family-name"]');
    setNativeValue(sob, pax.lastName);
  }
  if (birth) {
    setNativeValue(findField(root, ["data de nascimento"]), birth);
  }

  selectGender(root, pax.gender);

  if (cpf) {
    setNativeValue(findField(root, ["cpf"], { exact: true }), cpf);

    if (section.kind === "child" || section.kind === "infant") {
      setNativeValue(
        findField(root, [
          "nº de documento",
          "n° de documento",
          "no de documento",
          "número de documento",
          "numero de documento",
        ]),
        cpf
      );
    }
  }

  if (pax.email) {
    setNativeValue(findField(root, ["email", "e-mail"]), pax.email);
  }
  if (pax.phone) {
    const phone = String(pax.phone).replace(/\D/g, "").replace(/^55/, "");
    setNativeValue(findField(root, ["número", "numero"], { exact: true }), phone);
  }

  if (isFirst) {
    setCheckboxIfPresent(document.body, "repetir informação de contato", true);
  }

  // Só no layout antigo; no v2 não há esse botão
  if (!isLast) {
    clickConfirmIfPresent(root) || clickConfirmIfPresent(document.body);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const res = await chrome.runtime.sendMessage({ type: "TM_GET_FILL_PAYLOAD" });
  if (!res?.ok) {
    console.info("[TradeMiles]", res?.error || "Sem payload.");
    return;
  }
  if (!res.data?.useExtension) {
    console.info("[TradeMiles] Extensão desligada para esta sessão.");
    return;
  }
  const passengers = Array.isArray(res.data.passengers) ? res.data.passengers : [];
  if (!passengers.length) {
    console.info("[TradeMiles] Nenhum passageiro na sessão.");
    return;
  }

  await sleep(900);
  const sections = findPassengerSections();
  const n = Math.min(sections.length, passengers.length);

  for (let i = 0; i < n; i++) {
    fillInSection(sections[i], passengers[i], {
      isFirst: i === 0,
      isLast: i === n - 1,
    });
    await sleep(400);
    if (i < n - 1 && sections[i + 1]?.header) {
      expandSection(sections[i + 1].header);
      await sleep(300);
    }
  }

  console.info(
    `[TradeMiles] Preenchidos ${n} passageiro(s) (${location.pathname}). Revise antes de Continuar.`
  );
}

run().catch((e) => console.warn("[TradeMiles]", e));
