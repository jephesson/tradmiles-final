if (!window.__tmCotacaoBridge) {
  window.__tmCotacaoBridge = true;

  function onCotacaoPage() {
    return /\/dashboard\/cotacao-passagens/.test(location.pathname || "");
  }

  function notify(connected) {
    try {
      if (connected) document.documentElement.dataset.tmCotacaoExt = "1";
      window.dispatchEvent(
        new CustomEvent("tm-cotacao-bridge", { detail: { connected, version: "1.5.0" } })
      );
    } catch {
      /* ignore */
    }
  }

  notify(true);

  function kick() {
    if (!onCotacaoPage()) return;
    chrome.runtime.sendMessage({ type: "TM_COTACAO_START" }, () => {
      void chrome.runtime.lastError;
    });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "TM_COTACAO_SAVE") return;
    (async () => {
      try {
        await fetch(`/api/cotacao-passagens/search/${encodeURIComponent(msg.searchId)}`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ok: msg.ok,
            priceCents: msg.priceCents,
            airline: msg.airline,
            rawPrice: msg.rawPrice,
            depTime: msg.depTime || "",
            arrTime: msg.arrTime || "",
            durationMin: msg.durationMin || 0,
            stops: msg.stops,
            error: msg.error,
          }),
        });
      } catch {
        /* ignore */
      }
      sendResponse({ ok: true });
    })();
    return true;
  });

  chrome.runtime.sendMessage({ type: "TM_COTACAO_PING" }, (res) => {
    notify(Boolean(res?.ok));
  });

  setInterval(kick, 4000);
  kick();
}
