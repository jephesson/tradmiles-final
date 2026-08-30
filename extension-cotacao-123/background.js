const TRADE_URLS = [
  "https://www.trademiles.com.br/dashboard/cotacao-passagens*",
  "https://trademiles.com.br/dashboard/cotacao-passagens*",
  "http://localhost:3000/dashboard/cotacao-passagens*",
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "TM_COTACAO_OPEN") {
    openSearch(msg.search)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "TM_COTACAO_RESULT") {
    finishSearch({
      searchId: msg.searchId,
      ok: msg.ok,
      priceCents: msg.priceCents,
      airline: msg.airline,
      rawPrice: msg.rawPrice,
      error: msg.error,
      fromTabId: sender?.tab?.id,
    })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "TM_COTACAO_PING") {
    sendResponse({ ok: true, version: "1.1.0" });
    return false;
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!String(alarm?.name || "").startsWith("tm-cotacao-")) return;
  const searchId = alarm.name.slice("tm-cotacao-".length);
  const { tmActiveSearchId } = await chrome.storage.local.get("tmActiveSearchId");
  if (tmActiveSearchId && tmActiveSearchId === searchId) {
    await finishSearch({
      searchId,
      ok: false,
      error: "Tempo esgotado no 123milhas.",
    });
  }
});

async function openSearch(search) {
  if (!search?.id || !search?.url) throw new Error("Pesquisa inválida.");
  const { tmBusy } = await chrome.storage.local.get("tmBusy");
  if (tmBusy) return;

  const url = withSearchId(search.url, search.id);
  await chrome.storage.local.set({
    tmBusy: true,
    tmActiveSearchId: search.id,
    tmActiveTabId: null,
  });
  const tab = await chrome.tabs.create({ url, active: true });
  await chrome.storage.local.set({ tmActiveTabId: tab.id || null });
  chrome.alarms.create(`tm-cotacao-${search.id}`, { delayInMinutes: 1 });
}

function withSearchId(url, searchId) {
  try {
    const u = new URL(url);
    u.searchParams.set("tmSearch", searchId);
    u.hash = `tmSearch=${encodeURIComponent(searchId)}`;
    return u.toString();
  } catch {
    return url;
  }
}

async function finishSearch(payload) {
  const stored = await chrome.storage.local.get(["tmActiveSearchId", "tmActiveTabId"]);
  const searchId = payload.searchId || stored.tmActiveSearchId;
  if (!searchId) {
    await chrome.storage.local.set({ tmBusy: false, tmActiveSearchId: null, tmActiveTabId: null });
    return;
  }

  const tabs = await chrome.tabs.query({ url: TRADE_URLS });
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
      /* aba sem bridge — o match amplo do dashboard cobre o SPA */
    }
  }

  const closeId = payload.fromTabId || stored.tmActiveTabId;
  if (closeId) {
    try {
      await chrome.tabs.remove(closeId);
    } catch {
      /* ignore */
    }
  }

  try {
    await chrome.alarms.clear(`tm-cotacao-${searchId}`);
  } catch {
    /* ignore */
  }

  await chrome.storage.local.set({
    tmBusy: false,
    tmActiveSearchId: null,
    tmActiveTabId: null,
  });
}
