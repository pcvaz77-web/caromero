(() => {
  "use strict";
  if (window.__ASSISTENTE_SIAP_PAGE_BRIDGE__) return;
  window.__ASSISTENTE_SIAP_PAGE_BRIDGE__ = true;
  const markReady = () => document.documentElement?.setAttribute("data-assistente-siap-bridge", "0.7.2");
  markReady();
  document.addEventListener("DOMContentLoaded", markReady, { once: true });

  document.addEventListener("assistente-siap:postback", (event) => {
    let request;
    try { request = JSON.parse(String(event.detail || "")); } catch { return; }
    const target = String(request?.target || "");
    const argument = String(request?.argument || "");
    if (!/^ctl00\$(?:ctl00\$)?cphFuncionalidade\$/.test(target)) return;
    if (typeof window.__doPostBack !== "function") return;
    document.documentElement?.setAttribute("data-assistente-siap-last-postback", target);
    document.documentElement?.setAttribute("data-assistente-siap-last-argument", argument);
    window.__doPostBack(target, argument);
  });
})();
