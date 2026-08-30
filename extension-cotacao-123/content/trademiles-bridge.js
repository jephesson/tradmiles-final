let waiting = false;

async function claimAndOpen() {
  const jobId = document.body?.dataset?.tmCotacaoJob || "";
  if (!jobId || waiting) return;
  waiting = true;
  try {
    const r = await fetch("/api/cotacao-passagens/claim", {
      method: "POST",
      credentials: "include",
    });
    const j = await r.json();
    if (!j?.ok || !j.search) {
      waiting = false;
      return;
    }
    chrome.runtime.sendMessage({ type: "TM_COTACAO_OPEN", search: j.search });
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
    setTimeout(claimAndOpen, 800);
  })();
  return true;
});

setInterval(claimAndOpen, 4000);
claimAndOpen();
