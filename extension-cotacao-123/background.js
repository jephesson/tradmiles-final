const APP_ORIGINS = [
  "https://www.trademiles.com.br",
  "https://trademiles.com.br",
  "http://localhost:3000",
];

const TRADE_TABS = [
  "https://www.trademiles.com.br/dashboard/*",
  "https://trademiles.com.br/dashboard/*",
  "http://localhost:3000/dashboard/*",
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "TM_COTACAO_PING") {
    sendResponse({ ok: true, version: "1.8.0" });
    return false;
  }
  if (msg?.type === "TM_COTACAO_OPEN") {
    beginSearch(msg.search)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "TM_COTACAO_SHOULD_SCRAPE") {
    chrome.storage.local.get(["tmBusy", "tmTabId"]).then((st) => {
      const tabId = sender.tab?.id;
      const ok = Boolean(st.tmBusy && tabId && (!st.tmTabId || st.tmTabId === tabId));
      if (ok && !st.tmTabId && tabId) chrome.storage.local.set({ tmTabId: tabId });
      sendResponse({ ok });
    });
    return true;
  }
  if (msg?.type === "TM_COTACAO_START") {
    startNext().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "TM_COTACAO_RESULT") {
    onResult({
      searchId: msg.searchId,
      ok: msg.ok,
      priceCents: msg.priceCents,
      miles: msg.miles,
      airline: msg.airline,
      carrier: msg.carrier,
      rawPrice: msg.rawPrice,
      depTime: msg.depTime,
      arrTime: msg.arrTime,
      durationMin: msg.durationMin,
      stops: msg.stops,
      error: msg.error,
    })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === "tm-cotacao-pump") requestStart();
  if (alarm?.name === "tm-cotacao-timeout") onTimeout();
});

chrome.alarms.create("tm-cotacao-pump", { periodInMinutes: 1 });

function isCotacaoUrl(url) {
  return /\/dashboard\/cotacao-passagens/i.test(String(url || ""));
}

let startQueued = false;
function requestStart() {
  if (startQueued) return;
  startQueued = true;
  startNext()
    .catch(() => {})
    .finally(() => {
      startQueued = false;
    });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    tmBusy: false,
    tmActiveSearchId: null,
    tmTabId: null,
    tmWindowId: null,
  });
  chrome.tabs.query({ url: TRADE_TABS }).then((tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files: ["content/trademiles-bridge.js"] })
        .catch(() => {});
    }
  });
  requestStart();
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const url = info.url || tab?.url || "";
  if (isCotacaoUrl(url) && (info.url || info.status === "complete")) {
    requestStart();
  }
  if (info.status !== "complete") return;
  chrome.storage.local.get(["tmTabId", "tmBusy"]).then((st) => {
    if (!st.tmBusy) return;
    const file = scriptForUrl(tab?.url || "");
    if (!file) return;
    if (st.tmTabId && st.tmTabId !== tabId) return;
    if (!st.tmTabId) chrome.storage.local.set({ tmTabId: tabId });
    chrome.scripting
      .executeScript({ target: { tabId }, files: [file] })
      .catch(() => {});
  });
});

function scriptForUrl(url) {
  if (/decolar\.com/i.test(url)) return "content/decolar.js";
  if (/smiles\.com\.br/i.test(url)) return "content/smiles.js";
  if (/voegol\.com\.br/i.test(url)) return "content/voegol.js";
  if (/latamairlines\.com/i.test(url)) return "content/latam.js";
  if (/voeazul\.com\.br/i.test(url)) return "content/azul.js";
  return "";
}

async function appFetch(path, init) {
  let last = "TradeMiles offline.";
  for (const origin of APP_ORIGINS) {
    try {
      const res = await fetch(`${origin}${path}`, {
        credentials: "include",
        cache: "no-store",
        ...init,
        headers: {
          Accept: "application/json",
          ...(init?.headers || {}),
        },
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        last = "Faça login no TradeMiles neste Chrome.";
        continue;
      }
      if (!res.ok) {
        last = json?.error || `HTTP ${res.status}`;
        continue;
      }
      return { origin, json };
    } catch (e) {
      last = e instanceof Error ? e.message : "Falha de rede.";
    }
  }
  return { origin: "", json: null, error: last };
}

async function claimFromTradeTabs() {
  const tabs = await chrome.tabs.query({ url: TRADE_TABS });
  for (const tab of tabs) {
    if (!tab.id || !isCotacaoUrl(tab.url || "")) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/trademiles-bridge.js"],
      });
    } catch {
      /* ignore */
    }
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "TM_COTACAO_CLAIM" });
      if (res?.search?.id && res?.search?.url) return res.search;
    } catch {
      /* aba sem bridge */
    }
  }
  return null;
}

async function startNext() {
  const st = await chrome.storage.local.get(["tmBusy", "tmStartedAt"]);
  if (st.tmBusy && st.tmStartedAt && Date.now() - st.tmStartedAt < 160000) return;
  if (st.tmBusy) await chrome.storage.local.set({ tmBusy: false });

  const fromTab = await claimFromTradeTabs();
  const search = fromTab || (await appFetch("/api/cotacao-passagens/claim", { method: "POST" })).json?.search;
  if (!search?.id || !search?.url) {
    await closeWorkerWindow();
    await chrome.storage.local.set({ tmBusy: false, tmActiveSearchId: null });
    return;
  }
  await beginSearch(search);
}

async function beginSearch(search) {
  if (!search?.id || !search?.url) return;
  await chrome.storage.local.set({
    tmBusy: true,
    tmActiveSearchId: search.id,
    tmStartedAt: Date.now(),
    tmLast: `Abrindo ${search.airline || ""} ${search.originIata || ""}→${search.destIata || ""}`,
    tmFilters: filtersFromSearch(search),
  });
  chrome.alarms.create("tm-cotacao-timeout", { delayInMinutes: 2 });
  await openSearchWindow(search.url);
}

function filtersFromSearch(search) {
  return {
    maxDurationMin: Number(search.filterMaxDurationMin) || 0,
    depFrom: search.filterDepFrom || "",
    depTo: search.filterDepTo || "",
    directOnly: Boolean(search.filterDirectOnly),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rememberUserWindow() {
  try {
    const w = await chrome.windows.getLastFocused();
    if (w?.id) {
      const { tmWindowId } = await chrome.storage.local.get(["tmWindowId"]);
      if (!tmWindowId || w.id !== tmWindowId) {
        await chrome.storage.local.set({ tmUserWindowId: w.id });
        return w.id;
      }
    }
  } catch {
    /* ignore */
  }
  const { tmUserWindowId } = await chrome.storage.local.get(["tmUserWindowId"]);
  return tmUserWindowId || null;
}

async function yankFocusToUser(workerId) {
  const { tmUserWindowId } = await chrome.storage.local.get(["tmUserWindowId"]);
  const userId = tmUserWindowId;
  if (!userId || userId === workerId) return;
  for (const delay of [0, 150, 450]) {
    if (delay) await sleep(delay);
    try {
      const cur = await chrome.windows.getLastFocused();
      if (!cur || cur.id === workerId || delay === 0) {
        await chrome.windows.update(userId, { focused: true });
      }
    } catch {
      /* janela do usuário já fechou */
    }
  }
}

function resultBody(payload) {
  return {
    ok: Boolean(payload.ok),
    priceCents: payload.priceCents || 0,
    miles: payload.miles || 0,
    airline: payload.airline || "",
    carrier: payload.carrier || "",
    rawPrice: payload.rawPrice || "",
    depTime: payload.depTime || "",
    arrTime: payload.arrTime || "",
    durationMin: payload.durationMin || 0,
    stops: payload.stops,
    error: payload.error || "",
  };
}

async function openSearchWindow(url) {
  const userWinId = await rememberUserWindow();
  const { tmTabId, tmWindowId } = await chrome.storage.local.get(["tmTabId", "tmWindowId"]);
  if (tmTabId) {
    try {
      await chrome.tabs.update(tmTabId, { url, active: true, autoDiscardable: false });
      if (tmWindowId) {
        try {
          await chrome.windows.update(tmWindowId, { state: "normal" });
        } catch {
          /* ignore */
        }
      }
      await yankFocusToUser(tmWindowId);
      return;
    } catch {
      await chrome.storage.local.set({ tmTabId: null, tmWindowId: null });
    }
  }

  const win = await chrome.windows.create({
    url,
    focused: false,
    state: "normal",
    type: "normal",
    width: 1280,
    height: 900,
  });
  const tabId = win?.tabs?.[0]?.id || null;
  if (tabId) {
    try {
      await chrome.tabs.update(tabId, { autoDiscardable: false });
    } catch {
      /* ignore */
    }
  }
  await chrome.storage.local.set({
    tmWindowId: win?.id || null,
    tmTabId: tabId,
    tmUserWindowId: userWinId || null,
  });
  await yankFocusToUser(win?.id);
}

async function closeWorkerWindow() {
  const { tmWindowId, tmTabId } = await chrome.storage.local.get(["tmWindowId", "tmTabId"]);
  if (tmWindowId) {
    try {
      await chrome.windows.remove(tmWindowId);
    } catch {
      /* ignore */
    }
  } else if (tmTabId) {
    try {
      await chrome.tabs.remove(tmTabId);
    } catch {
      /* ignore */
    }
  }
  await chrome.storage.local.set({ tmWindowId: null, tmTabId: null, tmUserWindowId: null });
}

async function onTimeout() {
  const { tmBusy, tmActiveSearchId } = await chrome.storage.local.get(["tmBusy", "tmActiveSearchId"]);
  if (!tmBusy || !tmActiveSearchId) return;
  await onResult({
    searchId: tmActiveSearchId,
    ok: false,
    error: "Tempo esgotado na busca à vista.",
  });
}

async function saveViaTabs(searchId, payload) {
  const tabs = await chrome.tabs.query({ url: TRADE_TABS });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TM_COTACAO_SAVE",
        searchId,
        ...resultBody(payload),
      });
    } catch {
      /* aba sem bridge */
    }
  }
}

async function onResult(payload) {
  const stored = await chrome.storage.local.get(["tmActiveSearchId"]);
  const searchId = payload.searchId || stored.tmActiveSearchId;
  if (!searchId) {
    await chrome.storage.local.set({ tmBusy: false });
    return;
  }

  try {
    await chrome.alarms.clear("tm-cotacao-timeout");
  } catch {
    /* ignore */
  }

  const body = JSON.stringify(resultBody(payload));
  await saveViaTabs(searchId, payload);
  const saved = await appFetch(`/api/cotacao-passagens/search/${encodeURIComponent(searchId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  void saved;

  await chrome.storage.local.set({
    tmBusy: false,
    tmActiveSearchId: null,
    tmLast: payload.ok ? `${payload.airline || "cia"} ${payload.priceCents}` : payload.error || "sem preço",
  });
  await startNext();
}
