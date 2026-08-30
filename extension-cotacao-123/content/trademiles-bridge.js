if (!window.__tmCotacaoBridge) {
  window.__tmCotacaoBridge = true;

  function onCotacaoPage() {
    return /\/dashboard\/cotacao-passagens/.test(location.pathname || "");
  }

  function notify(connected) {
    try {
      window.dispatchEvent(
        new CustomEvent("tm-cotacao-bridge", { detail: { connected, version: "1.2.0" } })
      );
    } catch {
      /* ignore */
    }
  }

  function kick() {
    if (!onCotacaoPage()) return;
    chrome.runtime.sendMessage({ type: "TM_COTACAO_START" }, () => {
      void chrome.runtime.lastError;
    });
  }

  chrome.runtime.sendMessage({ type: "TM_COTACAO_PING" }, (res) => {
    notify(Boolean(res?.ok));
  });

  setInterval(kick, 4000);
  kick();
}
