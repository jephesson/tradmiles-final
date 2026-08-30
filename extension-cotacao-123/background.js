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
    sendResponse({ ok: true, version: "1.3.1" });
    return false;
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
      airline: msg.airline,
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
  if (alarm?.name === "tm-cotacao-pump") startNext();
  if (alarm?.name === "tm-cotacao-timeout") onTimeout();
});

chrome.alarms.create("tm-cotacao-pump", { periodInMinutes: 1 });

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    tmBusy: false,
    tmActiveSearchId: null,
    tmTabId: null,
    tmWindowId: null,
  });
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== "complete") return;
  chrome.storage.local.get(["tmTabId", "tmBusy"]).then((st) => {
    if (!st.tmBusy || st.tmTabId !== tabId) return;
    chrome.scripting
      .executeScript({ target: { tabId }, files: ["content/123milhas.js"] })
      .catch(() => {});
  });
});

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

async function startNext() {
  const st = await chrome.storage.local.get(["tmBusy", "tmStartedAt"]);
  if (st.tmBusy && st.tmStartedAt && Date.now() - st.tmStartedAt < 55000) return;
  if (st.tmBusy) await chrome.storage.local.set({ tmBusy: false });

  const claimed = await appFetch("/api/cotacao-passagens/claim", { method: "POST" });
  const search = claimed.json?.search;
  if (!search?.id || !search?.url) {
    await closeWorkerWindow();
    await chrome.storage.local.set({ tmBusy: false, tmActiveSearchId: null });
    return;
  }

  await chrome.storage.local.set({
    tmBusy: true,
    tmActiveSearchId: search.id,
    tmOrigin: claimed.origin,
    tmStartedAt: Date.now(),
    tmLast: `Abrindo ${search.originIata || ""}→${search.destIata || ""}`,
    tmFilters: filtersFromSearch(search),
  });
  chrome.alarms.create("tm-cotacao-timeout", { delayInMinutes: 1 });
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
    airline: payload.airline || "",
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
    error: "Tempo esgotado no 123milhas.",
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
  const saved = await appFetch(`/api/cotacao-passagens/search/${encodeURIComponent(searchId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!saved.json?.ok) {
    await saveViaTabs(searchId, payload);
  }

  await chrome.storage.local.set({
    tmBusy: false,
    tmActiveSearchId: null,
    tmLast: payload.ok ? `Pix ${payload.priceCents}` : payload.error || "sem preço",
  });
  await startNext();
}
