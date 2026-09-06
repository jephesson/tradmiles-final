if (!window.__tmCotacaoBridge) {
  window.__tmCotacaoBridge = true;

  let pump = 0;
  let dead = false;

  function onCotacaoPage() {
    return /\/dashboard\/cotacao-passagens/.test(location.pathname || "");
  }

  function runtimeAlive() {
    try {
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function notify(connected) {
    if (dead || !runtimeAlive()) return;
    try {
      if (connected) document.documentElement.dataset.tmCotacaoExt = "1";
      else delete document.documentElement.dataset.tmCotacaoExt;
      window.dispatchEvent(
        new CustomEvent("tm-cotacao-bridge", {
          detail: { connected, version: "1.6.0" },
        })
      );
    } catch {
      dead = true;
      if (pump) {
        clearInterval(pump);
        pump = 0;
      }
    }
  }

  function send(type, cb) {
    if (dead || !runtimeAlive()) return;
    try {
      chrome.runtime.sendMessage({ type }, (res) => {
        try {
          if (!chrome.runtime?.id) return;
          const err = chrome.runtime.lastError?.message || "";
          if (/invalidated|context/i.test(err)) return;
          cb?.(res);
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }

  function kick() {
    if (dead || !onCotacaoPage()) return;
    send("TM_COTACAO_START");
  }

  try {
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
  } catch {
    /* ignore */
  }

  send("TM_COTACAO_PING", (res) => notify(Boolean(res?.ok)));
  window.addEventListener("tm-cotacao-kick", kick);
  pump = window.setInterval(kick, 2500);
  kick();
}
