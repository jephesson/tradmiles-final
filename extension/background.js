const APP_ORIGINS = [
  "https://trademiles.com.br",
  "http://localhost:3000",
];

async function fetchFillPayload() {
  let lastError = null;
  for (const origin of APP_ORIGINS) {
    try {
      const res = await fetch(`${origin}/api/latam-extension/fill-session`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (res.status === 401) {
        lastError = "Faça login no TradeMiles.";
        continue;
      }
      if (!res.ok || !json?.ok) {
        lastError = json?.error || "Sem sessão de preenchimento.";
        continue;
      }
      return { ok: true, origin, data: json.data };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "Falha de rede.";
    }
  }
  return { ok: false, error: lastError || "TradeMiles offline." };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "TM_GET_FILL_PAYLOAD") {
    fetchFillPayload().then(sendResponse);
    return true;
  }
  return false;
});
