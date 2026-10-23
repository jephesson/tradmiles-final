/**
 * Roda no mundo MAIN (página). Content scripts isolados não enxergam
 * __reactFiber — sem isso o sexo da LATAM abre e não seleciona.
 */
(function () {
  if (window.__tmPageHooks === "0.2.59") return;
  window.__tmPageHooks = "0.2.59";

  function invokeReactClick(el, boundEl) {
    if (!el) return false;
    const bound = boundEl || el;
    const fiberKey = Object.keys(el).find(
      (k) =>
        k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
    );
    if (!fiberKey) return false;
    let f = el[fiberKey];
    for (let i = 0; i < 16 && f; i++) {
      const stateNode = f.stateNode;
      if (
        stateNode &&
        stateNode.nodeType === 1 &&
        stateNode !== bound &&
        typeof bound.contains === "function" &&
        !bound.contains(stateNode)
      ) {
        break;
      }
      const props = f.memoizedProps || f.pendingProps;
      const role = props?.role || (stateNode?.getAttribute && stateNode.getAttribute("role"));
      if (role === "listbox" || role === "combobox") break;
      if (props) {
        const handler =
          (typeof props.onClick === "function" && props.onClick) ||
          (typeof props.onPointerDown === "function" && props.onPointerDown) ||
          (typeof props.onMouseDown === "function" && props.onMouseDown) ||
          null;
        if (handler) {
          try {
            const ev = {
              preventDefault() {},
              stopPropagation() {},
              target: el,
              currentTarget: el,
              type: "click",
              button: 0,
              bubbles: true,
              cancelable: true,
              nativeEvent: { isTrusted: true },
              isTrusted: true,
              defaultPrevented: false,
            };
            handler(ev);
            return true;
          } catch {
            /* try parent fiber */
          }
        }
      }
      f = f.return;
    }
    return false;
  }

  function dispatchPointerClick(el) {
    if (!el) return false;
    let cx = 0;
    let cy = 0;
    try {
      const r = el.getBoundingClientRect();
      cx = r.left + Math.max(2, r.width / 2);
      cy = r.top + Math.max(2, r.height / 2);
    } catch {
      /* ignore */
    }
    const base = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX: cx,
      clientY: cy,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    };
    const types = [
      "pointerover",
      "mouseover",
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
    ];
    for (const type of types) {
      try {
        if (type.startsWith("pointer") && typeof PointerEvent === "function") {
          el.dispatchEvent(new PointerEvent(type, base));
        } else {
          el.dispatchEvent(new MouseEvent(type, base));
        }
      } catch {
        /* ignore */
      }
    }
    try {
      el.click();
    } catch {
      /* ignore */
    }
    return true;
  }

  function setReactInputValue(el, value) {
    if (!el) return false;
    const str = String(value ?? "");
    try {
      if (el.hasAttribute("pattern")) {
        el.dataset.tmPattern = el.dataset.tmPattern || el.getAttribute("pattern");
        el.removeAttribute("pattern");
      }
    } catch {
      /* ignore */
    }
    try {
      if (
        el.type === "email" &&
        /phones|telefone|phones0-number/i.test(
          `${el.name || ""} ${el.id || ""} ${el.getAttribute("aria-label") || ""}`
        )
      ) {
        el.setAttribute("type", "text");
      }
    } catch {
      /* ignore */
    }

    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    const tracker = el._valueTracker;
    if (tracker) {
      try {
        tracker.setValue(el.value || "");
      } catch {
        /* ignore */
      }
    }
    if (setter) setter.call(el, str);
    else el.value = str;

    // Dispara onChange do React/Formik (senão o campo fica "obrigatório" com valor na tela)
    try {
      const fiberKey = Object.keys(el).find(
        (k) =>
          k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
      );
      if (fiberKey) {
        let f = el[fiberKey];
        for (let i = 0; i < 16 && f; i++) {
          const props = f.memoizedProps || f.pendingProps;
          if (props && typeof props.onChange === "function") {
            props.onChange({
              target: el,
              currentTarget: el,
              type: "change",
              bubbles: true,
              preventDefault() {},
              stopPropagation() {},
            });
            break;
          }
          f = f.return;
        }
      }
    } catch {
      /* ignore */
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: str,
        inputType: "insertText",
      })
    );
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    } catch {
      /* ignore */
    }
    return true;
  }

  function normalizeTxt(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function findConfirmDadosInPage(adultNumber) {
    const scopes = [];
    const n = Number(adultNumber);
    if (n) {
      const content =
        document.getElementById(`accordion-passenger-ADT_${n}-content`) ||
        document.querySelector(`#accordion-passenger-ADT_${n}-content`);
      if (content) scopes.push(content);
      const summary =
        document.querySelector(
          `[data-testid="accordion-passenger-ADT_${n}-accordion"]`
        ) || document.querySelector(`#accordion-passenger-ADT_${n}`);
      if (summary && summary.parentElement) scopes.push(summary.parentElement);
    }
    scopes.push(document);

    const isConfirmLabel = (el) => {
      const t = normalizeTxt(el.textContent || el.innerText || "");
      return t === "confirmar dados" || t.startsWith("confirmar dados");
    };

    for (const scope of scopes) {
      const labels = Array.from(
        scope.querySelectorAll("span.MuiButton-label, span, button")
      ).filter(isConfirmLabel);
      for (const label of labels) {
        const btn =
          label.closest("button") ||
          label.closest(".MuiButtonBase-root") ||
          label.closest('[role="button"]') ||
          (label.tagName === "BUTTON" ? label : null);
        if (!btn) continue;
        // Prefere o que está na viewport / com tamanho
        try {
          const r = btn.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
        } catch {
          /* keep */
        }
        return { btn, label };
      }
    }
    return null;
  }

  function hardClick(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    } catch {
      /* ignore */
    }
    try {
      el.focus && el.focus();
    } catch {
      /* ignore */
    }
    const reacted = invokeReactClick(el, el);
    dispatchPointerClick(el);
    return reacted || true;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nodeVisible(node) {
    try {
      const r = node.getBoundingClientRect();
      return r.width >= 2 && r.height >= 2;
    } catch {
      return false;
    }
  }

  function genderValueShows(i, gender) {
    const want = gender === "F" ? "feminino" : "masculino";
    return normalizeTxt(
      document.getElementById(`passenger-${i}_gender-value`)?.textContent || ""
    ).includes(want);
  }

  function genderTrigger(i) {
    const valueEl = document.getElementById(`passenger-${i}_gender-value`);
    if (!valueEl) return null;
    return (
      valueEl.closest('[aria-haspopup="listbox"], [role="combobox"], button') ||
      valueEl.parentElement ||
      valueEl
    );
  }

  function genderListOpen() {
    const female = document.getElementById("Female");
    const male = document.getElementById("Male");
    if (female || male) return true;
    const box = document.querySelector('[role="listbox"]');
    return !!(box && (nodeVisible(box) || box.querySelector("li, [role='option']")));
  }

  function findV2GenderOption(gender) {
    const wantId = gender === "F" ? "Female" : "Male";
    const wantTxt = gender === "F" ? "feminino" : "masculino";
    const byId = document.getElementById(wantId);
    if (byId) return byId.closest("li, [role='option']") || byId;
    const nodes = document.querySelectorAll(
      '[role="listbox"] [role="option"], [role="listbox"] li, [role="option"], li#Female, li#Male'
    );
    for (const node of nodes) {
      const t = normalizeTxt(node.textContent || "");
      if (node.id === wantId || t === wantTxt || t.startsWith(wantTxt + " ")) {
        return node.closest("li, [role='option']") || node;
      }
    }
    return null;
  }

  async function waitV2GenderOption(gender, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = findV2GenderOption(gender);
      if (hit) return hit;
      await sleep(30);
    }
    return findV2GenderOption(gender);
  }

  function invokeDirectReactProps(el) {
    if (!el) return false;
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps"));
    if (!key) return false;
    const p = el[key];
    const ev = {
      preventDefault() {},
      stopPropagation() {},
      persist() {},
      target: el,
      currentTarget: el,
      type: "click",
      button: 0,
      bubbles: true,
      cancelable: true,
      nativeEvent: { preventDefault() {}, stopPropagation() {}, isTrusted: true },
    };
    for (const name of ["onMouseDown", "onPointerDown", "onClick", "onMouseUp"]) {
      if (typeof p[name] !== "function") continue;
      try {
        p[name]({ ...ev, type: name.slice(2).toLowerCase() });
        return true;
      } catch {
        /* try next */
      }
    }
    return false;
  }

  function clickGenderOption(option) {
    if (!option) return;
    const stopBlur = (e) => {
      try {
        e.preventDefault();
      } catch {
        /* ignore */
      }
    };
    option.addEventListener("mousedown", stopBlur, true);
    option.addEventListener("pointerdown", stopBlur, true);
    invokeDirectReactProps(option);
    invokeReactClick(option, option);
    dispatchPointerClick(option);
    option.removeEventListener("mousedown", stopBlur, true);
    option.removeEventListener("pointerdown", stopBlur, true);
  }

  function fireKey(el, key) {
    if (!el) return;
    const keyCode =
      key === "Enter" ? 13 : key === "ArrowUp" ? 38 : key === "ArrowDown" ? 40 : key === " " ? 32 : 0;
    const code =
      key === " " ? "Space" : key === "Enter" ? "Enter" : key === "ArrowUp" ? "ArrowUp" : key === "ArrowDown" ? "ArrowDown" : key;
    const init = {
      key,
      code,
      keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window,
    };
    try {
      const down = new KeyboardEvent("keydown", init);
      const up = new KeyboardEvent("keyup", init);
      try {
        Object.defineProperty(down, "keyCode", { get: () => keyCode });
        Object.defineProperty(up, "keyCode", { get: () => keyCode });
      } catch {
        /* ignore */
      }
      el.dispatchEvent(down);
      el.dispatchEvent(up);
    } catch {
      /* ignore */
    }
  }

  function callSelectOnChange(startEl, gender) {
    if (!startEl) return false;
    const fiberKey = Object.keys(startEl).find(
      (k) =>
        k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
    );
    if (!fiberKey) return false;
    const payloads =
      gender === "F"
        ? ["Female", "FEMALE", "F", "Feminino"]
        : ["Male", "MALE", "M", "Masculino"];
    let f = startEl[fiberKey];
    for (let n = 0; n < 28 && f; n++) {
      const props = f.memoizedProps || f.pendingProps;
      if (props) {
        const hint = `${props.name || ""} ${props.id || ""} ${props.value || ""}`;
        const looksGender = /gender|sexo|Female|Male/i.test(hint);
        for (const name of ["onChange", "onValueChange", "onSelect"]) {
          if (typeof props[name] !== "function") continue;
          if (!looksGender && name !== "onValueChange") continue;
          for (const value of payloads) {
            try {
              props[name](value);
            } catch {
              /* ignore */
            }
            try {
              props[name]({
                target: { value },
                currentTarget: startEl,
                type: "change",
                preventDefault() {},
                stopPropagation() {},
              });
            } catch {
              /* ignore */
            }
          }
        }
      }
      f = f.return;
    }
    return true;
  }

  async function pickV2Gender(gender, i) {
    if (genderValueShows(i, gender)) return { ok: true, how: "already" };
    const valueEl = document.getElementById(`passenger-${i}_gender-value`);
    const trigger = genderTrigger(i);

    if (valueEl) {
      callSelectOnChange(valueEl, gender);
      await sleep(40);
      if (genderValueShows(i, gender)) return { ok: true, how: "fiber-onChange" };
    }

    if (trigger) {
      try {
        trigger.focus();
      } catch {
        /* ignore */
      }
      fireKey(trigger, "ArrowDown");
      await sleep(80);
    }
    if (!genderListOpen() && trigger) {
      dispatchPointerClick(trigger);
      await sleep(80);
    }

    let option = await waitV2GenderOption(gender, 700);
    if (option) {
      clickGenderOption(option);
      await sleep(120);
      if (genderValueShows(i, gender)) return { ok: true, how: option.id || "option-click" };
    }

    const listbox = document.querySelector('[role="listbox"]');
    const keyTarget = listbox || option || trigger;
    if (keyTarget) {
      try {
        (trigger || listbox || keyTarget).focus();
      } catch {
        /* ignore */
      }
      if (!genderListOpen()) fireKey(trigger, "ArrowDown");
      await sleep(50);
      if (gender === "F") fireKey(keyTarget, "ArrowUp");
      else fireKey(keyTarget, "Home");
      await sleep(50);
      fireKey(keyTarget, "Enter");
      await sleep(120);
      if (genderValueShows(i, gender)) return { ok: true, how: "keyboard" };
    }

    if (valueEl) callSelectOnChange(valueEl, gender);
    const hidden =
      document.querySelector(`input[name="passenger-${i}_gender"]`) ||
      document.getElementById(`passenger-${i}_gender`);
    if (hidden) {
      setReactInputValue(hidden, gender === "F" ? "Female" : "Male");
      setReactInputValue(hidden, gender === "F" ? "FEMALE" : "MALE");
    }
    await sleep(40);
    return { ok: genderValueShows(i, gender), how: genderValueShows(i, gender) ? "input" : "miss" };
  }

  window.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || data.source !== "trademiles") return;

    if (data.type === "react-click") {
      const el = data.selector ? document.querySelector(data.selector) : null;
      const option =
        el?.closest?.(
          '[role="option"], [role="listbox"] li, li#Female, li#Male, li[id="Female"], li[id="Male"]'
        ) || null;
      const target = option || el;
      let ok = false;
      if (target) {
        ok = invokeReactClick(target, option || target);
        dispatchPointerClick(target);
        const extraIsTrigger =
          el &&
          el !== target &&
          (el.getAttribute("role") === "combobox" ||
            el.getAttribute("aria-haspopup") === "listbox");
        if (el && el !== target && !extraIsTrigger) dispatchPointerClick(el);
        ok = true;
      }
      window.postMessage(
        {
          source: "trademiles-page",
          type: "react-click-done",
          id: data.id,
          ok,
        },
        "*"
      );
      return;
    }

    if (data.type === "pick-v2-gender") {
      const gender = String(data.gender || "").toUpperCase() === "F" ? "F" : "M";
      const i = Math.max(0, Math.trunc(Number(data.passengerIndex) || 0));
      const msgId = data.id;
      pickV2Gender(gender, i).then((result) => {
        window.postMessage(
          {
            source: "trademiles-page",
            type: "pick-v2-gender-done",
            id: msgId,
            ok: !!result.ok,
            how: result.how,
          },
          "*"
        );
      });
      return;
    }

    if (data.type === "click-confirm-dados") {
      const hit = findConfirmDadosInPage(data.adultNumber);
      let ok = false;
      let how = "miss";
      if (hit) {
        ok = hardClick(hit.btn);
        if (hit.label && hit.label !== hit.btn) hardClick(hit.label);
        how = hit.btn.tagName + (hit.btn.className || "").slice(0, 40);
      }
      window.postMessage(
        {
          source: "trademiles-page",
          type: "click-confirm-dados-done",
          id: data.id,
          ok,
          how,
        },
        "*"
      );
      return;
    }

    if (data.type === "react-set-value") {
      const el = data.selector ? document.querySelector(data.selector) : null;
      const ok = !!(el && setReactInputValue(el, data.value));
      window.postMessage(
        {
          source: "trademiles-page",
          type: "react-set-value-done",
          id: data.id,
          ok,
        },
        "*"
      );
    }
  });
})();
