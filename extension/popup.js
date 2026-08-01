const el = document.getElementById("status");

chrome.runtime.sendMessage({ type: "TM_GET_FILL_PAYLOAD" }).then((res) => {
  if (!res?.ok) {
    el.textContent = res?.error || "Faça login no TradeMiles.";
    el.style.color = "#b91c1c";
    return;
  }
  const n = res.data?.passengers?.length || 0;
  const on = Boolean(res.data?.useExtension);
  el.textContent = on
    ? `Sessão ok · ${n} passageiro(s) prontos`
    : "Logado, mas extensão desligada nesta venda.";
  el.style.color = on ? "#047857" : "#b45309";
});
