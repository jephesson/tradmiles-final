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
    for (let i = 0; i < 12 && f; i++) {
      const props = f.memoizedProps || f.pendingProps;
      if (props && typeof props.onClick === "function") {
        try {
          props.onClick({
            preventDefault() {},
            stopPropagation() {},
            target: el,
            currentTarget: el,
            type: "click",
            button: 0,
            bubbles: true,
            nativeEvent: {},
            isTrusted: true,
          });
          return true;
        } catch {
          return false;
        }
      }
      f = f.return;
    }
    return false;
  }

  window.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || data.source !== "trademiles" || data.type !== "react-click") {
      return;
    }
    const el = data.selector ? document.querySelector(data.selector) : null;
    const ok = !!(el && invokeReactClick(el));
    window.postMessage(
      {
        source: "trademiles-page",
        type: "react-click-done",
        id: data.id,
        ok,
      },
      "*"
    );
  });
})();
