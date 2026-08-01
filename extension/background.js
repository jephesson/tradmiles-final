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
        lastError = "Faça login no TradeMiles (mesma janela, não anônima).";
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
  if (msg?.type === "TM_FILL_ACTIVE_TAB") {
    (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        sendResponse({ ok: false, error: "Nenhuma aba ativa." });
        return;
      }
      if (!/latamairlines\.com/i.test(tab.url || "")) {
        sendResponse({
          ok: false,
          error: "Abra a aba da LATAM (passageiros) e tente de novo.",
        });
        return;
      }
      try {
        const result = await chrome.tabs.sendMessage(tab.id, {
          type: "TM_RUN_FILL",
        });
        sendResponse(result || { ok: false, error: "Sem resposta do content script." });
      } catch {
        sendResponse({
          ok: false,
          error:
            "Recarregue a página da LATAM (ou reinstale a extensão) e tente de novo.",
        });
      }
    })();
    return true;
  }
  return false;
});
