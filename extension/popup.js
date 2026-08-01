const el = document.getElementById("status");
const hint = document.getElementById("hint");
const btn = document.getElementById("fillBtn");

chrome.runtime.sendMessage({ type: "TM_GET_FILL_PAYLOAD" }).then((res) => {
  if (!res?.ok) {
    el.textContent = res?.error || "Faça login no TradeMiles.";
    el.style.color = "#b91c1c";
    btn.disabled = true;
    return;
  }
  const n = res.data?.passengers?.length || 0;
  const on = Boolean(res.data?.useExtension);
  el.textContent = on
    ? `Sessão ok · ${n} passageiro(s) prontos`
    : "Logado, mas extensão desligada nesta venda.";
  el.style.color = on ? "#047857" : "#b45309";
  btn.disabled = !on || n === 0;
  if (on && n) {
    hint.textContent =
      "Se não preencher sozinho, clique no botão com a aba da LATAM aberta.";
  }
});

btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.textContent = "Preenchendo…";
  const res = await chrome.runtime.sendMessage({ type: "TM_FILL_ACTIVE_TAB" });
  if (!res?.ok) {
    hint.textContent = res?.error || "Falhou ao preencher.";
    hint.style.color = "#b91c1c";
  } else {
    hint.textContent = `Preencheu ${res.fields || 0} campo(s) em ${res.sections || 0} seção(ões). Revise.`;
    hint.style.color = "#047857";
  }
  btn.textContent = "Preencher esta aba";
  btn.disabled = false;
});
