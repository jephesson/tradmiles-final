document.getElementById("go")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "TM_COTACAO_START" }, () => {
    void chrome.runtime.lastError;
    window.close();
  });
});
