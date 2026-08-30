if (window.__tmCotacaoBridge) {
  /* already injected on this document */
} else {
  window.__tmCotacaoBridge = true;
  bootBridge();
}

function bootBridge() {
  let waiting = false;

  function onCotacaoPage() {
    return /\/dashboard\/cotacao-passagens/.test(location.pathname || "");
  }

  function notifyPage(connected) {
    try {
      window.dispatchEvent(
        new CustomEvent("tm-cotacao-bridge", { detail: { connected, version: "1.1.0" } })
      );
    } catch {
      /* ignore */
    }
  }

  async function claimAndOpen() {
    if (!onCotacaoPage() || waiting) return;
    waiting = true;
    notifyPage(true);
    try {
      const r = await fetch("/api/cotacao-passagens/claim", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!j?.ok || !j.search?.id || !j.search?.url) {
        waiting = false;
        return;
      }
      const res = await chrome.runtime.sendMessage({
        type: "TM_COTACAO_OPEN",
        search: j.search,
      });
      if (!res?.ok) waiting = false;
      else setTimeout(() => {
        waiting = false;
      }, 80000);
    } catch {
      waiting = false;
    }
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
            error: msg.error,
          }),
        });
      } catch {
        /* ignore */
      }
      waiting = false;
      sendResponse({ ok: true });
      setTimeout(claimAndOpen, 600);
    })();
    return true;
  });

  chrome.runtime.sendMessage({ type: "TM_COTACAO_PING" }, (res) => {
    notifyPage(Boolean(res?.ok));
  });

  setInterval(claimAndOpen, 2500);
  claimAndOpen();
}
