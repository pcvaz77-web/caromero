'use strict';

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const NAVIGATION_TIMEOUT_MS = 15000;
const ATTEMPT_TIMEOUT_MS = 10000;
const MAX_NAVIGATION_ATTEMPTS = 4;
const POLL_INTERVAL_MS = 400;
const NAVIGATION_ACTION_TIMEOUT_MS = 1200;

class SiapLoginRequiredError extends Error {
  constructor() {
    super('Sua sessão do SIAP terminou. Faça login novamente no SIAP, abra o Diário do Professor e depois clique em “Buscar chamadas salvas” outra vez.');
    this.name = 'SiapLoginRequiredError';
    this.code = 'SIAP_LOGIN_REQUIRED';
  }
}

function isSiapLoginUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== 'siap.educacao.go.gov.br') return true;
    return /(?:login|logon|acesso|autentic|entrar|default)/i.test(parsed.pathname);
  } catch (_) {
    return true;
  }
}

async function assertSiapSession(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (isSiapLoginUrl(tab?.url)) throw new SiapLoginRequiredError();
  return tab;
}

function injectFile(tabId) {
  return chrome.scripting.executeScript({ target:{ tabId }, files:['content.js'] });
}

async function callReader(tabId, method, args = []) {
  await assertSiapSession(tabId);
  await injectFile(tabId);
  const results = await chrome.scripting.executeScript({
    target:{ tabId },
    func:(methodName, methodArgs) => {
      const reader = globalThis[methodName];
      if (typeof reader !== 'function') throw new Error(`Leitor indisponível: ${methodName}`);
      return JSON.stringify({ value:reader(...methodArgs) });
    },
    args:[method, args]
  });
  const injection = results?.[0];
  if (injection?.error) throw new Error(injection.error.message || String(injection.error));
  if (typeof injection?.result !== 'string') throw new Error(`O leitor ${method} não devolveu uma resposta válida.`);
  const payload = JSON.parse(injection.result);
  return payload.value;
}

async function triggerReaderNavigation(tabId, method, args = []) {
  // O SIAP usa postback: ao trocar filtro/data, a página é descarregada antes
  // de chrome.scripting.executeScript responder. A execução pode ficar pendente
  // para sempre mesmo com o clique já realizado. Limitamos somente a espera da
  // ação; a confirmação real continua sendo feita por waitForReader/waitForPath.
  await Promise.race([
    callReader(tabId, method, args),
    wait(NAVIGATION_ACTION_TIMEOUT_MS)
  ]);
}

async function waitForReader(tabId, method, args, predicate, description, timeoutMs = NAVIGATION_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await callReader(tabId, method, args);
      if (predicate(result)) return result;
    } catch (error) {
      if (error?.code === 'SIAP_LOGIN_REQUIRED') throw error;
      lastError = error;
    }
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error(`O SIAP não confirmou ${description} em até ${timeoutMs / 1000} segundos.${lastError?.message ? ` Último erro: ${lastError.message}` : ''}`);
}

async function navigateAndConfirm(tabId, actionMethod, actionArgs, snapshotMethod, snapshotArgs, predicate, description) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_NAVIGATION_ATTEMPTS; attempt += 1) {
    await assertSiapSession(tabId);
    try {
      const current = await callReader(tabId, snapshotMethod, snapshotArgs);
      if (current && predicate(current)) return current;
      const previousPageToken = current?.pageToken || await callReader(tabId, '__carometroPageToken');
      try { await triggerReaderNavigation(tabId, actionMethod, actionArgs); } catch (error) {
        if (error?.code === 'SIAP_LOGIN_REQUIRED') throw error;
      }
      return await waitForReader(
        tabId,
        snapshotMethod,
        snapshotArgs,
        state => Boolean(state && state.pageToken !== previousPageToken && predicate(state)),
        description,
        ATTEMPT_TIMEOUT_MS
      );
    } catch (error) {
      if (error?.code === 'SIAP_LOGIN_REQUIRED') throw error;
      lastError = error;
    }
  }
  throw new Error(`O SIAP não respondeu após ${MAX_NAVIGATION_ATTEMPTS} tentativas para ${description}.${lastError?.message ? ` Último retorno: ${lastError.message}` : ''}`);
}

async function navigateReader(tabId, request, method, args, predicate, description) {
  await navigateAndConfirm(tabId, method, args, '__carometroAttendancePosition', [request], predicate, description);
  return readAttendanceSnapshot(tabId, request, `a leitura da frequência após ${description}`);
}

const isAttendanceSnapshot = state => Boolean(
  typeof state?.pageToken === 'string' &&
  state?.context &&
  typeof state.month === 'string' &&
  Array.isArray(state.registeredDays) &&
  Array.isArray(state.entries)
);

function readAttendanceSnapshot(tabId, request, description = 'uma leitura completa da frequência') {
  return waitForReader(
    tabId,
    '__carometroAttendanceSnapshot',
    [request],
    isAttendanceSnapshot,
    description
  );
}

async function waitForPath(tabId, path) {
  const expected = path.toLowerCase();
  const deadline = Date.now() + NAVIGATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const tab = await assertSiapSession(tabId);
    try {
      if (new URL(tab.url).pathname.toLowerCase() === expected && tab.status === 'complete') return tab;
    } catch (_) { /* URL transitória durante o postback. */ }
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error(`O SIAP não abriu ${path} em até ${NAVIGATION_TIMEOUT_MS / 1000} segundos.`);
}

async function openPathWithRetries(tabId, actionMethod, path, description) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_NAVIGATION_ATTEMPTS; attempt += 1) {
    const tab = await assertSiapSession(tabId);
    if (new URL(tab.url).pathname.toLowerCase() === path.toLowerCase() && tab.status === 'complete') return tab;
    try {
      try { await triggerReaderNavigation(tabId, actionMethod); } catch (error) {
        if (error?.code === 'SIAP_LOGIN_REQUIRED') throw error;
        // O postback costuma destruir o contexto que iniciou o clique.
      }
      return await waitForPath(tabId, path);
    } catch (error) {
      if (error?.code === 'SIAP_LOGIN_REQUIRED') throw error;
      lastError = error;
    }
  }
  throw new Error(`O SIAP não respondeu após ${MAX_NAVIGATION_ATTEMPTS} tentativas para ${description}.${lastError?.message ? ` Último retorno: ${lastError.message}` : ''}`);
}

const comparable = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const sameText = (actual, expected) => comparable(actual).includes(comparable(expected));
const diaryRowMatches = (row, request) =>
  comparable(row.className) === comparable(request.className) &&
  sameText(row.grade, request.grade) &&
  sameText(row.shift, request.shift) &&
  sameText(row.subject, request.subject) &&
  sameText(row.term, request.term);

async function prepareFrequencyTab(tab, request) {
  const required = ['composition', 'grade', 'className', 'shift', 'subject', 'term'];
  const missing = required.filter(field => !String(request[field] || '').trim());
  if (missing.length) throw new Error(`Preencha no Carômetro: ${missing.join(', ')}.`);
  await assertSiapSession(tab.id);
  if (/FrequenciaAlunoEdicao\.aspx/i.test(tab.url || '')) {
    try {
      let current = await callReader(tab.id, '__carometroAttendanceSnapshot', [request]);
      if (!isAttendanceSnapshot(current)) current = await readAttendanceSnapshot(tab.id, request);
      return tab.id;
    } catch (_) { /* A turma aberta é diferente; refazemos a seleção pelo Diário. */ }
  }
  if (!/DiarioEscolarListagem\.aspx/i.test(tab.url || '')) {
    await chrome.tabs.update(tab.id, { url:'https://siap.educacao.go.gov.br/DiarioEscolarListagem.aspx' });
    await waitForPath(tab.id, '/diarioescolarlistagem.aspx');
  }
  let diary = await callReader(tab.id, '__carometroDiarySnapshot');
  if (!sameText(diary.composition, request.composition)) {
    diary = await navigateAndConfirm(
      tab.id, '__carometroSelectComposition', [request.composition], '__carometroDiarySnapshot', [],
      state => sameText(state.composition, request.composition) && state.grades.some(grade => sameText(grade, request.grade)),
      `a composição ${request.composition}`
    );
  }
  diary = await navigateAndConfirm(
    tab.id, '__carometroListDiary', [request], '__carometroDiarySnapshot', [],
    state => state.rows.some(row => diaryRowMatches(row, request)),
    `a listagem da turma ${request.className}`
  );
  if (!diary.rows.some(row => diaryRowMatches(row, request) && row.selected)) {
    await navigateAndConfirm(
      tab.id, '__carometroSelectDiaryRow', [request.className], '__carometroDiarySnapshot', [],
      state => state.rows.some(row => diaryRowMatches(row, request) && row.selected),
      `a seleção da turma ${request.className}`
    );
  }
  await openPathWithRetries(tab.id, '__carometroOpenFrequency', '/frequenciaalunoedicao.aspx', `abrir a frequência da turma ${request.className}`);
  await readAttendanceSnapshot(tab.id, request, `a frequência da turma ${request.className}`);
  return tab.id;
}

function finishResult(context, months, entries) {
  const valid = entries.filter(entry => !entry.blocked);
  const lessonKeys = new Set(valid.map(entry => `${entry.date}|${entry.lesson}`));
  const students = new Map();
  valid.forEach(entry => {
    const student = students.get(entry.registration) || { registration:entry.registration, name:entry.name, presences:0, absences:0 };
    if (entry.absent) student.absences += 1; else student.presences += 1;
    students.set(entry.registration, student);
  });
  const rows = [...students.values()].map(student => ({
    ...student,
    percentage:Math.round((student.presences / Math.max(1, student.presences + student.absences)) * 100)
  })).sort((a,b) => a.percentage - b.percentage || a.name.localeCompare(b.name, 'pt-BR'));
  const totalMarks = rows.reduce((sum, student) => sum + student.presences + student.absences, 0);
  const totalPresences = rows.reduce((sum, student) => sum + student.presences, 0);
  return { context, months, lessons:lessonKeys.size, average:Math.round((totalPresences / Math.max(1, totalMarks)) * 100), students:rows };
}

function chooseSiapTab(tabs) {
  const supported = tabs.filter(tab => /(?:FrequenciaAlunoEdicao|DiarioEscolarListagem)\.aspx/i.test(tab.url || ''));
  const candidates = supported.length ? supported : tabs;
  return [...candidates].sort((left, right) =>
    Number(Boolean(right.active)) - Number(Boolean(left.active)) ||
    Number(right.lastAccessed || 0) - Number(left.lastAccessed || 0)
  )[0];
}

async function collectAttendance(tabId, request) {
  const months = (request.months || []).filter(Boolean);
  if (!months.length) throw new Error('Selecione pelo menos um mês no Carômetro.');
  const uniqueEntries = new Map();
  let context;
  const initialSnapshot = await readAttendanceSnapshot(tabId, request);
  const original = { month:initialSnapshot.month, selectedDate:initialSnapshot.selectedDate };
  for (const month of months) {
    let snapshot = await readAttendanceSnapshot(tabId, request);
    context ||= snapshot.context;
    if (snapshot.month !== month) {
      snapshot = await navigateReader(
        tabId, request, '__carometroSelectMonth', [month],
        state => state.month === month,
        `a abertura do mês ${month}`
      );
    }
    for (const day of snapshot.registeredDays) {
      const expected = `${String(day).padStart(2, '0')}/${String(snapshot.monthNumber).padStart(2, '0')}/${snapshot.context.year}`;
      if (snapshot.selectedDate !== expected) {
        snapshot = await navigateReader(
          tabId, request, '__carometroSelectRegisteredDay', [day],
          state => state.selectedDate === expected,
          `a chamada verde de ${expected}`
        );
      }
      snapshot.entries.forEach(entry => uniqueEntries.set(`${entry.date}|${entry.lesson}|${entry.registration}`, entry));
    }
  }
  let finalSnapshot = await readAttendanceSnapshot(tabId, request);
  if (original.month && finalSnapshot.month !== original.month) {
    finalSnapshot = await navigateReader(
      tabId, request, '__carometroSelectMonth', [original.month],
      state => state.month === original.month,
      `a restauração do mês ${original.month}`
    );
  }
  if (original.selectedDate && finalSnapshot.selectedDate !== original.selectedDate) {
    const originalDay = Number.parseInt(original.selectedDate.slice(0, 2), 10);
    if (finalSnapshot.registeredDays.includes(originalDay)) {
      await navigateReader(
        tabId, request, '__carometroSelectRegisteredDay', [originalDay],
        state => state.selectedDate === original.selectedDate,
        `a restauração da data ${original.selectedDate}`
      );
    }
  }
  return finishResult(context, months, [...uniqueEntries.values()]);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!['CM_ATTENDANCE_REQUEST', 'CM_ASSISTED_CAPTURE'].includes(message?.type) || sender.tab?.url?.startsWith('https://sistemacarometro.com.br/') !== true) return;
  chrome.tabs.query({ url:'https://siap.educacao.go.gov.br/*' }, tabs => {
    const siapTab = chooseSiapTab(tabs);
    if (!siapTab?.id) {
      sendResponse({ ok:false, code:'SIAP_NOT_OPEN', message:'Abra o SIAP, entre no Diário do Professor e tente novamente.' });
      return;
    }
    if (message.type === 'CM_ASSISTED_CAPTURE') {
      assertSiapSession(siapTab.id)
        .then(() => readAttendanceSnapshot(siapTab.id, {}, 'a chamada atualmente aberta'))
        .then(snapshot => {
          const day = Number.parseInt(String(snapshot.selectedDate || '').slice(0, 2), 10);
          if (!snapshot.selectedDate || !snapshot.registeredDays.includes(day)) throw new Error('Abra no SIAP uma data verde com frequência já salva.');
          if (!snapshot.entries.length) throw new Error('A chamada abriu, mas a lista de frequência ainda não terminou de carregar. Tente capturar novamente.');
          sendResponse({ ok:true, result:snapshot });
        })
        .catch(error => {
          if (error?.code === 'SIAP_LOGIN_REQUIRED') sendResponse({ ok:false, code:error.code, message:error.message });
          else sendResponse({ ok:false, code:'SIAP_CAPTURE_FAILED', message:`Não foi possível capturar esta chamada: ${error?.message || 'erro desconhecido'}` });
        });
      return;
    }
    prepareFrequencyTab(siapTab, message.request || {})
      .then(tabId => collectAttendance(tabId, message.request || {}))
      .then(result => sendResponse({ ok:true, result }))
      .catch(error => {
        if (error?.code === 'SIAP_LOGIN_REQUIRED') {
          sendResponse({ ok:false, code:error.code, message:error.message });
          return;
        }
        sendResponse({ ok:false, code:'SIAP_READ_FAILED', message:`Falha ao ler o SIAP: ${error?.message || 'erro desconhecido'}` });
      });
  });
  return true;
});
