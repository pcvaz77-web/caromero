(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CepiUsefulLists = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sortName = value => String(value || '').replace(/^\s*\d+\s*[.)ºª-]?\s*/, '');

  function prepare({schoolId, classId, year, semester, students, groups, groupStudents, groupTeachers, tutors, tutorAssignments}) {
    if (!schoolId || !classId || !Number.isInteger(Number(year)) || ![1,2].includes(Number(semester))) throw new Error('Selecione a turma, o ano letivo e o semestre.');
    const scoped = rows => (rows || []).filter(row => row.school_id === schoolId);
    const selectedGroups = new Map(scoped(groups).filter(group =>
      group.active === true && Number(group.academic_year) === Number(year) &&
      (group.semester == null || Number(group.semester) === Number(semester)) &&
      ['eletiva','clube'].includes(group.kind)
    ).map(group => [group.id, group]));
    const teacherNames = new Map((groupTeachers || []).map(item => [item.user_id, item.full_name]));
    const tutorNames = new Map(scoped(tutors).map(item => [item.id, item.display_name]));
    const activeTutors = new Map(scoped(tutorAssignments).filter(item => item.active === true).map(item => [item.student_id, tutorNames.get(item.tutor_id) || 'Tutor não encontrado']));
    const studentGroups = new Map();
    for (const link of scoped(groupStudents)) {
      if (link.ended_at || !selectedGroups.has(link.group_id)) continue;
      const group = selectedGroups.get(link.group_id);
      if (!studentGroups.has(link.student_id)) studentGroups.set(link.student_id, {eletiva:[],clube:[]});
      studentGroups.get(link.student_id)[group.kind].push({
        title:group.title,
        teacher:teacherNames.get(group.responsible_user_id) || (group.responsible_user_id ? 'Responsável indisponível' : 'Responsável não definido')
      });
    }
    return scoped(students).filter(student => student.class_id === classId && student.enrollment_status === 'active')
      .sort((a,b) => sortName(a.full_name).localeCompare(sortName(b.full_name),'pt-BR',{numeric:true,sensitivity:'base'}))
      .map(student => ({
        id:student.id, name:student.full_name,
        electives:studentGroups.get(student.id)?.eletiva || [],
        clubs:studentGroups.get(student.id)?.clube || [],
        tutor:activeTutors.get(student.id) || 'Tutor não definido'
      }));
  }

  function allocation(items) {
    return items.length ? items.map(item => `<div class="allocation"><strong>${escape(item.title)}</strong><small>Professor responsável: ${escape(item.teacher)}</small></div>`).join('') : '<span class="missing">Não cadastrado</span>';
  }
  function table(rows) {
    return `<table class="cepi-useful-table"><thead><tr><th>Aluno</th><th>Eletiva</th><th>Clube</th><th>Tutor(a)</th></tr></thead><tbody>${rows.map(row => `<tr><td class="student-name">${escape(row.name)}</td><td>${allocation(row.electives)}</td><td>${allocation(row.clubs)}</td><td>${escape(row.tutor)}</td></tr>`).join('')}</tbody></table>`;
  }
  function printHtml({rows, schoolName, className, year, semester}) {
    const title = `Alocações da turma ${className}`;
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>
      @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#edf1f8;color:#17233a;font:10pt Arial,sans-serif}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;background:#fff}.toolbar button{border:0;border-radius:8px;background:#5149dc;color:#fff;padding:10px 16px;font-weight:700;cursor:pointer}.sheet{max-width:210mm;margin:12px auto;padding:12mm;background:#fff;box-shadow:0 8px 30px #17233a20}.heading{padding:0 0 7mm;border-bottom:3px solid #4262d5;margin-bottom:6mm}.kicker{font-size:8pt;color:#4167d4;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.heading h1{font-size:18pt;margin:2mm 0 1mm}.heading p{margin:0;color:#53627e}.cepi-useful-table{width:100%;border-collapse:collapse;table-layout:fixed}.cepi-useful-table th{text-align:left;background:#e9efff;color:#173e87;font-size:9pt;padding:3mm 2mm}.cepi-useful-table td{vertical-align:top;padding:3mm 2mm;border-bottom:1px solid #d8e1ef;overflow-wrap:anywhere;line-height:1.25}.cepi-useful-table th:first-child{width:24%}.cepi-useful-table th:nth-child(2),.cepi-useful-table th:nth-child(3){width:28%}.cepi-useful-table th:last-child{width:20%}.student-name{font-weight:700}.allocation+ .allocation{margin-top:2mm}.allocation strong,.allocation small{display:block}.allocation small{color:#52617a;font-size:8pt;margin-top:.5mm}.missing{color:#69758a}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}@media print{body{background:#fff}.toolbar{display:none}.sheet{max-width:none;margin:0;padding:0;box-shadow:none}}
    </style><div class="toolbar"><strong>${escape(title)} · ${rows.length} aluno(s)</strong><button type="button" id="printNow">Imprimir / salvar PDF</button></div><main class="sheet"><header class="heading"><span class="kicker">Meu CEPI · Imprimir listas</span><h1>${escape(title)}</h1><p>${escape(schoolName || 'Escola')} · ${escape(year)} · ${escape(semester)}º semestre · ${rows.length} aluno(s)</p></header>${table(rows)}</main><script>document.getElementById('printNow').onclick=()=>window.print()<\/script></html>`;
  }
  return Object.freeze({prepare,table,printHtml});
});
