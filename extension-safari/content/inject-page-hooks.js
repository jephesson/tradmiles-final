/**
 * Safari não usa world: MAIN como o Chrome. Injeta page-hooks no mundo da página
 * para o sexo/React da LATAM funcionar.
 */
(function () {
  try {
    if (document.documentElement.getAttribute("data-tm-page-hooks") === "1") return;
    document.documentElement.setAttribute("data-tm-page-hooks", "1");
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("content/page-hooks.js");
    s.async = false;
    s.onload = function () {
      s.remove();
    };
    (document.head || document.documentElement).appendChild(s);
  } catch {
    /* Safari sem permissão ainda */
  }
})();
