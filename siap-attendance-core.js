(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CarometroSiapAttendance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PARTICLES = new Set(['DA', 'DAS', 'DE', 'DO', 'DOS', 'E']);

  function normalizeName(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function significantTokens(value) {
    return normalizeName(value).split(' ').filter(token => token && !PARTICLES.has(token));
  }

  function nameScore(left, right) {
    const a = significantTokens(left);
    const b = significantTokens(right);
    if (!a.length || !b.length) return 0;
    const aSet = new Set(a);
    const bSet = new Set(b);
    const intersection = [...aSet].filter(token => bSet.has(token)).length;
    const union = new Set([...aSet, ...bSet]).size;
    const tokenScore = union ? intersection / union : 0;
    const boundaryBonus = a[0] === b[0] && a[a.length - 1] === b[b.length - 1] ? 0.12 : 0;
    return Math.min(1, tokenScore + boundaryBonus);
  }

  function matchStudents(carometroStudents, siapStudents) {
    const matchedCarometro = new Set();
    const matches = [];
    const conflicts = [];
    const unmatched = [];

    for (const siapStudent of siapStudents || []) {
      const exact = (carometroStudents || []).filter(student =>
        !matchedCarometro.has(student.id) && normalizeName(student.name) === normalizeName(siapStudent.name));
      if (exact.length === 1) {
        matchedCarometro.add(exact[0].id);
        matches.push({ student:exact[0], attendance:siapStudent, confidence:1, method:'exact-name' });
        continue;
      }
      const candidates = (carometroStudents || [])
        .filter(student => !matchedCarometro.has(student.id))
        .map(student => ({ student, score:nameScore(student.name, siapStudent.name) }))
        .filter(candidate => candidate.score >= 0.55)
        .sort((a, b) => b.score - a.score);
      if (candidates.length && candidates[0].score >= 0.9 && (!candidates[1] || candidates[0].score - candidates[1].score >= 0.12)) {
        matchedCarometro.add(candidates[0].student.id);
        matches.push({ student:candidates[0].student, attendance:siapStudent, confidence:candidates[0].score, method:'similar-name' });
      } else if (exact.length > 1 || candidates.length) {
        conflicts.push({ attendance:siapStudent, candidates:(exact.length ? exact.map(student => ({ student, score:1 })) : candidates.slice(0, 3)) });
      } else unmatched.push(siapStudent);
    }

    return {
      matches,
      conflicts,
      unmatched,
      missing:(carometroStudents || []).filter(student => !matchedCarometro.has(student.id))
    };
  }

  function classifyAttendance(record) {
    if (record?.transferred) return { key:'transferred', label:'Transferido', percentage:null };
    const total = Math.max(0, Number(record?.total) || 0);
    const present = Math.max(0, Math.min(total, Number(record?.present) || 0));
    const percentage = total ? Math.round((present / total) * 100) : null;
    if (percentage === null) return { key:'unknown', label:'Sem dados', percentage:null };
    if (percentage >= 75) return { key:'frequent', label:'Frequente', percentage };
    if (percentage >= 50) return { key:'attention', label:'Costuma faltar', percentage };
    return { key:'critical', label:'Falta muito', percentage };
  }

  return Object.freeze({ normalizeName, nameScore, matchStudents, classifyAttendance });
});
