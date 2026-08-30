let busy = false;
let activeTabId = null;
let activeSearchId = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "TM_COTACAO_OPEN") {
    openSearch(msg.search).then(() => sendResponse({ ok: true })).catch((e) => {
      sendResponse({ ok: false, error: String(e?.message || e) });
    });
    return true;
  }
  if (msg?.type === "TM_COTACAO_RESULT") {
    finishSearch(msg).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

async function openSearch(search) {
  if (!search?.id || !search?.url) return;
  if (busy) return;
  busy = true;
  activeSearchId = search.id;
  const tab = await chrome.tabs.create({ url: search.url, active: true });
  activeTabId = tab.id;
  setTimeout(async () => {
    if (busy && activeSearchId === search.id) {
      await finishSearch({
        searchId: search.id,
        ok: false,
        error: "Tempo esgotado no 123milhas.",
      });
    }
  }, 55000);
}

async function finishSearch(payload) {
  const searchId = payload.searchId || activeSearchId;
  if (!searchId) {
    busy = false;
    return;
  }
  const tabs = await chrome.tabs.query({
    url: [
      "https://www.trademiles.com.br/dashboard/cotacao-passagens*",
      "https://trademiles.com.br/dashboard/cotacao-passagens*",
      "http://localhost:3000/dashboard/cotacao-passagens*",
    ],
  });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TM_COTACAO_SAVE",
        searchId,
        ok: Boolean(payload.ok),
        priceCents: payload.priceCents || 0,
        airline: payload.airline || "",
        rawPrice: payload.rawPrice || "",
        error: payload.error || "",
      });
    } catch {
      /* tab sem bridge */
    }
  }
  if (activeTabId) {
    try {
      await chrome.tabs.remove(activeTabId);
    } catch {
      /* ignore */
    }
  }
  busy = false;
  activeTabId = null;
  activeSearchId = null;
}
