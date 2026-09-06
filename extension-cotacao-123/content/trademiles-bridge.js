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
          detail: { connected, version: "1.8.1" },
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

  function send(msg, cb) {
    if (dead || !runtimeAlive()) return;
    const payload = typeof msg === "string" ? { type: msg } : msg;
    try {
      chrome.runtime.sendMessage(payload, (res) => {
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
      if (msg?.type === "TM_COTACAO_CLAIM") {
        (async () => {
          try {
            const r = await fetch("/api/cotacao-passagens/claim", {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers: { Accept: "application/json" },
            });
            const json = await r.json().catch(() => null);
            sendResponse({ ok: Boolean(json?.search?.url), search: json?.search || null });
          } catch {
            sendResponse({ ok: false, search: null });
          }
        })();
        return true;
      }
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
              miles: msg.miles,
              airline: msg.airline,
              carrier: msg.carrier,
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
  window.addEventListener("tm-cotacao-open", (e) => {
    const search = e.detail;
    if (!search?.url) return;
    send({ type: "TM_COTACAO_OPEN", search });
  });
  pump = window.setInterval(kick, 2500);
  kick();
}
