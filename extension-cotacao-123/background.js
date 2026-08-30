const APP_ORIGINS = [
  "https://www.trademiles.com.br",
  "https://trademiles.com.br",
  "http://localhost:3000",
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "TM_COTACAO_PING") {
    sendResponse({ ok: true, version: "1.2.0" });
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

async function cookieHeader(origin) {
  try {
    const cookies = await chrome.cookies.getAll({ url: origin });
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch {
    return "";
  }
}

async function appFetch(path, init) {
  let last = "TradeMiles offline.";
  for (const origin of APP_ORIGINS) {
    try {
      const cookie = await cookieHeader(origin);
      const res = await fetch(`${origin}${path}`, {
        credentials: "include",
        cache: "no-store",
        ...init,
        headers: {
          Accept: "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
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
  if (st.tmBusy && st.tmStartedAt && Date.now() - st.tmStartedAt < 70000) return;
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
  });
  chrome.alarms.create("tm-cotacao-timeout", { delayInMinutes: 1 });
  await openHiddenSearch(search.url);
}

async function openHiddenSearch(url) {
  const { tmTabId, tmWindowId } = await chrome.storage.local.get(["tmTabId", "tmWindowId"]);
  if (tmTabId) {
    try {
      await chrome.tabs.update(tmTabId, { url, active: false });
      if (tmWindowId) {
        try {
          await chrome.windows.update(tmWindowId, { focused: false, state: "minimized" });
        } catch {
          /* ignore */
        }
      }
      return;
    } catch {
      await chrome.storage.local.set({ tmTabId: null, tmWindowId: null });
    }
  }

  let win;
  try {
    win = await chrome.windows.create({
      url,
      focused: false,
      state: "minimized",
      type: "normal",
    });
  } catch {
    win = await chrome.windows.create({
      url,
      focused: false,
      type: "popup",
      width: 1100,
      height: 800,
      left: 0,
      top: 0,
    });
  }
  const tabId = win?.tabs?.[0]?.id || null;
  await chrome.storage.local.set({ tmWindowId: win?.id || null, tmTabId: tabId });
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
  await chrome.storage.local.set({ tmWindowId: null, tmTabId: null });
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

async function onResult(payload) {
  const stored = await chrome.storage.local.get(["tmActiveSearchId", "tmOrigin"]);
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

  const body = JSON.stringify({
    ok: Boolean(payload.ok),
    priceCents: payload.priceCents || 0,
    airline: payload.airline || "",
    rawPrice: payload.rawPrice || "",
    error: payload.error || "",
  });
  await appFetch(`/api/cotacao-passagens/search/${encodeURIComponent(searchId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  await chrome.storage.local.set({ tmBusy: false, tmActiveSearchId: null });
  await startNext();
}
