if (!globalThis.__tmCaptureMiles) {
  globalThis.__tmCaptureMiles = true;

  const CIA = /latamairlines/i.test(location.hostname)
    ? "latam"
    : /smiles\.com\.br/i.test(location.hostname)
      ? "smiles"
      : /voeazul/i.test(location.hostname)
        ? "azul"
        : "";

  let lastRoot = null;
  let bar = null;
  let statusEl = null;
  let previewEl = null;
  let open = false;
  let captureOn = false;

  function fmtMoney(cents) {
    return ((cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function fmtMiles(n) {
    return (n || 0).toLocaleString("pt-BR");
  }

  function selectedText() {
    const sel = window.getSelection?.();
    const t = sel && String(sel.toString() || "").replace(/\s+/g, " ").trim();
    if (t && t.length >= 8) return t.slice(0, 6000);
    const fromClick = String(lastRoot?.innerText || "").replace(/\s+/g, " ").trim();
    if (fromClick.length >= 8) return fromClick.slice(0, 6000);
    return "";
  }

  function refreshPreview() {
    if (!previewEl || !open) return;
    const t = selectedText();
    if (!t) {
      previewEl.textContent = "Selecione milhas e taxa.";
      return;
    }
    previewEl.textContent = t.length > 90 ? `${t.slice(0, 90)}…` : t;
  }

  function render() {
    if (!bar) return;
    const panel = bar.querySelector("[data-tm-panel]");
    const pill = bar.querySelector("[data-tm-pill]");
    if (panel) panel.style.display = open ? "block" : "none";
    if (pill) pill.style.display = open ? "none" : "flex";
    refreshPreview();
  }

  function mount() {
    if (bar || !CIA) return;
    bar = document.createElement("div");
    bar.style.cssText =
      "position:fixed;z-index:2147483647;right:12px;bottom:12px;font:12px/1.35 system-ui,sans-serif;color:#e2e8f0";
    bar.innerHTML = `
      <button type="button" data-tm-pill style="display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:0;border-radius:999px;background:rgba(15,23,42,.78);color:#e2e8f0;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 4px 16px rgba(0,0,0,.2)">
        <span style="width:6px;height:6px;border-radius:99px;background:#34d399"></span>
        TM
      </button>
      <div data-tm-panel style="display:none;width:240px;padding:10px 12px;border-radius:12px;background:rgba(15,23,42,.92);backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.28)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span style="font-weight:650;font-size:11px;letter-spacing:.02em">${CIA.toUpperCase()}</span>
          <button type="button" data-tm-min style="border:0;background:transparent;color:#94a3b8;cursor:pointer;font-size:14px;line-height:1">–</button>
        </div>
        <div data-tm-preview style="margin-top:6px;opacity:.85;font-size:11px;min-height:28px;max-height:52px;overflow:hidden"></div>
        <button type="button" data-tm-send style="margin-top:8px;width:100%;height:30px;border:0;border-radius:8px;background:#334155;color:#f8fafc;font:650 11px system-ui;cursor:pointer">Ler seleção</button>
        <div data-tm-status style="margin-top:6px;font-size:10px;opacity:.8"></div>
      </div>`;
    document.documentElement.appendChild(bar);
    previewEl = bar.querySelector("[data-tm-preview]");
    statusEl = bar.querySelector("[data-tm-status]");
    bar.querySelector("[data-tm-pill]").addEventListener("click", () => {
      open = true;
      render();
    });
    bar.querySelector("[data-tm-min]").addEventListener("click", () => {
      open = false;
      render();
    });
    bar.querySelector("[data-tm-send]").addEventListener("click", sendCapture);
    render();
  }

  function unmount() {
    bar?.remove();
    bar = null;
    previewEl = null;
    statusEl = null;
    open = false;
  }

  function applyCapture(on) {
    captureOn = Boolean(on);
    if (!CIA) return;
    if (!captureOn) {
      unmount();
      return;
    }
    mount();
  }

  function sendCapture() {
    const snippet = selectedText();
    if (!snippet) {
      statusEl.textContent = "Selecione o trecho e tente de novo.";
      return;
    }
    statusEl.textContent = "Lendo…";
    chrome.runtime.sendMessage({ type: "TM_COTACAO_INTERPRET_MILES", cia: CIA, snippet }, (res) => {
      void chrome.runtime.lastError;
      if (!res?.ok) {
        statusEl.textContent = res?.error || "Abra a cotação no TradeMiles.";
        return;
      }
      statusEl.textContent = `${fmtMiles(res.miles)} · ${fmtMoney(res.feeCents || 0)}`;
    });
  }

  document.addEventListener(
    "click",
    (e) => {
      if (!captureOn) return;
      let el = e.target;
      if (!el || el === bar || bar?.contains(el)) return;
      for (let i = 0; i < 12 && el; i++) {
        const t = (el.innerText || "").replace(/\s+/g, " ").trim();
        if (t.length > 24 && t.length < 5000) {
          lastRoot = el;
          refreshPreview();
          return;
        }
        el = el.parentElement;
      }
    },
    true
  );
  document.addEventListener("mouseup", () => {
    if (captureOn) setTimeout(refreshPreview, 50);
  });

  chrome.storage.local.get(["tmCaptureOn"], (st) => applyCapture(Boolean(st.tmCaptureOn)));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.tmCaptureOn) return;
    applyCapture(Boolean(changes.tmCaptureOn.newValue));
  });
}
