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
    if (!previewEl) return;
    const t = selectedText();
    if (!t) {
      previewEl.textContent = "Selecione na página o voo (milhas e taxa).";
      return;
    }
    previewEl.textContent = t.length > 140 ? `${t.slice(0, 140)}…` : t;
  }

  function mount() {
    if (bar || !CIA) return;
    bar = document.createElement("div");
    bar.style.cssText =
      "position:fixed;z-index:2147483647;right:16px;bottom:16px;width:300px;padding:12px 14px;border-radius:14px;background:#0f172a;color:#fff;font:13px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.28)";
    bar.innerHTML = `<div style="font-weight:700;margin-bottom:4px">TradeMiles · ${CIA.toUpperCase()}</div>
      <div data-tm-preview style="opacity:.9;font-size:12px;min-height:40px;max-height:72px;overflow:hidden"></div>
      <button type="button" data-tm-send style="margin-top:10px;width:100%;height:36px;border:0;border-radius:10px;background:#22c55e;color:#052e16;font:700 13px system-ui;cursor:pointer">Ler seleção e enviar</button>
      <div data-tm-status style="margin-top:8px;font-size:11px;opacity:.85"></div>`;
    document.documentElement.appendChild(bar);
    previewEl = bar.querySelector("[data-tm-preview]");
    statusEl = bar.querySelector("[data-tm-status]");
    bar.querySelector("[data-tm-send]").addEventListener("click", sendCapture);
  }

  function sendCapture() {
    const snippet = selectedText();
    if (!snippet) {
      statusEl.textContent = "Selecione o trecho do voo (milhas + taxa) e clique de novo.";
      return;
    }
    statusEl.textContent = "A IA está lendo o recorte…";
    chrome.runtime.sendMessage({ type: "TM_COTACAO_INTERPRET_MILES", cia: CIA, snippet }, (res) => {
      void chrome.runtime.lastError;
      if (!res?.ok) {
        statusEl.textContent = res?.error || "Abra a cotação no TradeMiles e tente de novo.";
        return;
      }
      statusEl.textContent = `Enviado: ${fmtMiles(res.miles)} milhas · taxa ${fmtMoney(res.feeCents || 0)}`;
    });
  }

  document.addEventListener(
    "click",
    (e) => {
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
  document.addEventListener("mouseup", () => setTimeout(refreshPreview, 50));
  document.addEventListener("keyup", refreshPreview);

  mount();
  setInterval(refreshPreview, 1000);
  refreshPreview();
}
