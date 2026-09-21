(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiapExamCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  function answers(text, count, alphabet = 'ABCDE', official = false) {
    const values = Array.isArray(text) ? text : String(text).toUpperCase().trim().split(/[\s,;]+/);
    if (values.length !== count || !Number.isInteger(count) || count < 1 || count > 100) throw new Error('A quantidade de respostas deve corresponder ao total de questões.');
    const allowed = official ? alphabet : alphabet + '-*?';
    if (values.some(v => typeof v !== 'string' || v.length !== 1 || !allowed.includes(v))) throw new Error('Use as alternativas do modelo; - para branco, * para múltipla e ? para dúvida.');
    return [...values];
  }
  function ranges(list, count) {
    if (!Array.isArray(list) || !list.length) throw new Error('Informe as disciplinas e os intervalos.');
    const used = new Set(), names = new Set();
    for (const r of list) {
      const name = normalize(r.subject);
      if (!name || names.has(name) || !Number.isInteger(r.from) || !Number.isInteger(r.to) || r.from < 1 || r.to > count || r.from > r.to) throw new Error('Divisão por disciplinas inválida.');
      names.add(name);
      for (let n = r.from; n <= r.to; n++) { if (used.has(n)) throw new Error('Há questões repetidas nas disciplinas.'); used.add(n); }
    }
    if (used.size !== count) throw new Error('Todas as questões precisam pertencer a uma disciplina.');
    return list.map(r => ({ subject: String(r.subject).trim(), from: r.from, to: r.to }));
  }
  function validateKey(key) {
    if (!key || !['ABCD', 'ABCDE'].includes(key.alphabet)) throw new Error('Modelo de alternativas inválido.');
    if(key.firstQuestion!==undefined && (!Number.isInteger(key.firstQuestion)||key.firstQuestion<1||key.firstQuestion>200)) throw new Error('Numeração inicial inválida.');
    return { ...(key.firstQuestion!==undefined?{firstQuestion:key.firstQuestion}:{}), alphabet: key.alphabet, answers: answers(key.answers, key.answers.length, key.alphabet, true), ranges: ranges(key.ranges, key.answers.length) };
  }
  function score(key, response) {
    key = validateKey(key);
    response = answers(response, key.answers.length, key.alphabet);
    if (response.includes('?')) throw new Error('Revise as marcações duvidosas antes de corrigir.');
    return key.ranges.map(r => ({ ...r, total: r.to - r.from + 1, correct: response.slice(r.from - 1, r.to).filter((v, i) => v === key.answers[r.from - 1 + i]).length }));
  }
  function matchName(name, roster) {
    const n = normalize(name);
    const exact = roster.filter(r => normalize(r.name) === n && n.length > 3);
    return exact.length === 1 ? { id: exact[0].id, status: 'suggested' } : { id: '', status: 'review' };
  }
  function extraction(raw) {
    if (!raw || typeof raw.name !== 'string' || typeof raw.title !== 'string' || typeof raw.warning !== 'string' || !['ABCD', 'ABCDE'].includes(raw.alphabet) || !Array.isArray(raw.questions)) throw new Error('Leitura inválida. Fotografe novamente.');
    const count = raw.questions.length;
    if (raw.questions.some((q, i) => q.number !== i + 1)) throw new Error('A numeração das questões não foi lida com segurança.');
    return { name: raw.name.slice(0, 180), title: raw.title.slice(0, 240), warning: raw.warning.slice(0, 500), alphabet: raw.alphabet, answers: answers(raw.questions.map(q => q.mark), count, raw.alphabet), ranges: ranges(raw.ranges, count) };
  }
  function batch(key, items, roster, subject, total) {
    const seen = new Set();
    return items.map(item => {
      if (!item.reviewed) throw new Error('Confira o lote antes de preencher.');
      const student = roster.find(r => r.id === item.studentId);
      if (!student || student.unavailable) throw new Error('Aluno indisponível ou sem identificação.');
      if (seen.has(student.id)) throw new Error('Há mais de uma prova para o mesmo aluno.');
      seen.add(student.id);
      const result = score(key, item.answers).filter(r => normalize(r.subject) === normalize(subject));
      if (result.length !== 1 || result[0].total !== total) throw new Error('Disciplina ou total de questões diferente do SIAP.');
      return { id: student.id, name: student.name, correct: result[0].correct, present: true };
    });
  }
  return Object.freeze({ normalize, answers, ranges, validateKey, score, matchName, extraction, batch });
});
