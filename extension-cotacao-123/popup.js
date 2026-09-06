document.getElementById("go")?.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "TM_COTACAO_START" }, () => {
    void chrome.runtime.lastError;
    window.close();
  });
});

const capture = document.getElementById("capture");
chrome.runtime.sendMessage({ type: "TM_COTACAO_PING" }, (res) => {
  void chrome.runtime.lastError;
  if (capture) capture.checked = Boolean(res?.captureOn);
});
capture?.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "TM_COTACAO_SET_CAPTURE", on: Boolean(capture.checked) }, () => {
    void chrome.runtime.lastError;
  });
});
