/**
 * Roda no mundo MAIN (página). Content scripts isolados não enxergam
 * __reactFiber — sem isso o sexo da LATAM abre e não seleciona.
 */
(function () {
  if (window.__tmPageHooks) return;
  window.__tmPageHooks = true;

  function invokeReactClick(el) {
    if (!el) return false;
    const fiberKey = Object.keys(el).find(
      (k) =>
        k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
    );
    if (!fiberKey) return false;
    let f = el[fiberKey];
    for (let i = 0; i < 16 && f; i++) {
      const props = f.memoizedProps || f.pendingProps;
      if (props) {
        const handler =
          (typeof props.onClick === "function" && props.onClick) ||
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
    const reacted = invokeReactClick(el);
    try {
      el.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window })
      );
      el.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window })
      );
      el.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
      );
    } catch {
      /* ignore */
    }
    try {
      el.click();
    } catch {
      /* ignore */
    }
    return reacted || true;
  }

  window.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || data.source !== "trademiles") return;

    if (data.type === "react-click") {
      const el = data.selector ? document.querySelector(data.selector) : null;
      let ok = !!(el && invokeReactClick(el));
      if (el) {
        try {
          el.click();
          ok = true;
        } catch {
          /* ignore */
        }
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
