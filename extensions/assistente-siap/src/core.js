(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AssistenteSiapCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLORS = Object.freeze({
    saved: [37, 205, 30],
    pending: [15, 122, 221]
  });

  const ROUTES = Object.freeze({
    "/LancamentoNotasModeloEdicao.aspx": "exam",
    "/LancamentoNotasModeloListagem.aspx": "exam",
    "/DiarioEscolarListagem.aspx": "diary",
    "/ConteudoProgramaticoEdicao.aspx": "content",
    "/FrequenciaAlunoEdicao.aspx": "attendance",
    "/NotasModeloEdicao.aspx": "grades",
    "/AlunoAcessoRemotoOnlineEdicao.aspx": "remote",
    "/PlanejamentoProfessorTurmaListagem.aspx": "planning-list",
    "/PlanejamentoProfessorTurmaEdicao.aspx": "planning-calendar",
    "/PlanejamentoProfessorPlanejamentoAulaEdicao.aspx": "planning-lesson",
    "/AcompanhamentoPlanejamentoProfessorListagem.aspx": "planning-overview",
    "/PlanoEducacionalIndividualizadoPEIProfessorListagem.aspx": "pei-list",
    "/PlanoEducacionalIndividualizadoPEIProfessorEdicao.aspx": "pei-edit"
  });

  function pageType(pathname) {
    return ROUTES[pathname] || "unsupported";
  }

  function parseRgb(value) {
    const match = String(value || "").match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return match ? match.slice(1, 4).map(Number) : null;
  }

  function colorState(value, tolerance = 8) {
    const rgb = parseRgb(value);
    if (!rgb) return "unknown";
    for (const [state, target] of Object.entries(COLORS)) {
      if (rgb.every((channel, index) => Math.abs(channel - target[index]) <= tolerance)) return state;
    }
    return "other";
  }

  function parseBrazilianDate(value) {
    const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function isEligibleDate(date, today = new Date()) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    return date.getTime() <= end.getTime();
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function backoff(attempt) {
    return [2000, 4000, 8000][Math.max(0, Math.min(2, attempt - 1))];
  }

  function safeContext(context) {
    const allowed = ["year", "composition", "subject", "grade", "term", "shift", "classroom"];
    return Object.fromEntries(allowed.map((key) => [key, String(context?.[key] || "").trim().slice(0, 100)]));
  }

  function parsePostBack(source) {
    const match = String(source || "").match(/__doPostBack\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]*)['\"]\s*\)/);
    if (!match) return null;
    let argument = match[2];
    try { argument = decodeURIComponent(argument); } catch { /* mantém o valor original */ }
    // O atributo href contém um literal JavaScript. Nele, "\\\\" representa
    // uma única barra no argumento efetivamente recebido por __doPostBack.
    argument = argument.replace(/\\\\/g, "\\");
    return { target: match[1], argument };
  }

  function parsePostBackSources(...sources) {
    for (const source of sources) {
      const parsed = parsePostBack(source);
      if (parsed) return parsed;
    }
    return null;
  }

  function isAllowedPostBackTarget(target) {
    return /^ctl00\$(?:ctl00\$)?cphFuncionalidade\$/.test(String(target || ""));
  }

  function usesMonthlyCalendar(page) {
    return page === "content" || page === "attendance";
  }

  return Object.freeze({ COLORS, ROUTES, pageType, parseRgb, colorState, parseBrazilianDate, isEligibleDate, unique, backoff, safeContext, parsePostBack, parsePostBackSources, isAllowedPostBackTarget, usesMonthlyCalendar });
});
