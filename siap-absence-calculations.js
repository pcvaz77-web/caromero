// Totais da aba Notas: só se calcula presença quando faltas e aulas
// ministradas são comparáveis no mesmo bimestre e disciplina.
(function (root) {
  'use strict';
  const periodKey = row => Number(row.academic_year) * 10 + Number(row.bimester);
  const termBimester = term => {
    const text = String(term || '');
    const bimesters = [...text.matchAll(/([1-4])\s*º?\s*Bimestre/gi)].map(match => Number(match[1]));
    if (bimesters.length) return Math.max(...bimesters);
    const semester = text.match(/([1-2])\s*º?\s*semestre/i);
    return semester ? Number(semester[1]) * 2 : null;
  };
  const presence = row => {
    const absences = Number(row.absences), taught = Number(row.taught_hours);
    if (!Number.isInteger(absences) || !Number.isInteger(taught) || taught <= 0 || absences < 0 || absences > taught) return null;
    return Math.round(100 * (taught - absences) / taught);
  };
  function classifyLatest(rows, fallback, limits = {frequentMinimum:75,absentMinimum:60}) {
    if (!rows.length) return null;
    const latest = Math.max(...rows.map(periodKey));
    const current = rows.filter(row => periodKey(row) === latest);
    if (!current.length || current.some(row => presence(row) === null)) return null;
    if (fallback) {
      const year = Number(fallback.academic_year);
      const bimester = termBimester(fallback.term);
      if (!Number.isInteger(year) || bimester === null || latest < year * 10 + bimester) return null;
    }
    const worst = [...current].sort((a,b) => presence(a) - presence(b) || String(a.subject).localeCompare(String(b.subject),'pt-BR'))[0];
    const percentage = presence(worst);
    const status = percentage >= limits.frequentMinimum ? 'frequent' : percentage >= limits.absentMinimum ? 'absent' : 'active_search';
    return {student_id:worst.student_id,source_key:'absence',status,percentage,
      academic_year:Number(worst.academic_year),bimester:Number(worst.bimester),
      term:`${worst.bimester}º Bimestre`,months:[],source_dates:[],
      subject:worst.subject,absence_count:worst.absences,taught_hours:worst.taught_hours,
      updated_at:worst.imported_at};
  }
  function totalsForPeriod(rows) {
    const byStudent = new Map();
    for (const row of rows) {
      const item = byStudent.get(row.student_id) || {studentId:row.student_id,total:0,subjects:0};
      item.total += Number(row.absences) || 0;
      item.subjects++;
      byStudent.set(row.student_id,item);
    }
    const totals = [...byStudent.values()];
    const mean = totals.length ? totals.reduce((sum,item) => sum + item.total,0) / totals.length : null;
    return {totals,byStudent,mean};
  }
  const api = {presence,termBimester,classifyLatest,totalsForPeriod};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SiapAbsenceCalculations = api;
})(typeof window === 'undefined' ? globalThis : window);
