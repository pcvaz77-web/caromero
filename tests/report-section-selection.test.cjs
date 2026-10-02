const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'reports.js'), 'utf8');
const start = source.indexOf('  async function renderStudentPage(');
const end = source.indexOf('  function applyFooters', start);
assert.ok(start >= 0 && end > start, 'função que monta a página do aluno encontrada');

const student = {
  student_id: 'aluno-ficticio',
  full_name: 'Aluno Fictício',
  class_name: 'Turma Teste',
  shift: 'Matutino',
  has_report: 'Observação fictícia',
  photoDataUrl: 'data:image/png;base64,ficticio'
};
const empty = new Map();

async function render(selected) {
  const lines = [];
  let images = 0;
  const doc = {
    setFont() {}, setFontSize() {}, setTextColor() {}, setDrawColor() {}, line() {}, addPage() {},
    text(value) { lines.push(Array.isArray(value) ? value.join(' ') : String(value)); },
    splitTextToSize(value) { return [String(value)]; },
    getImageProperties() { return { width: 100, height: 100, fileType: 'PNG' }; },
    addImage() { images++; }
  };
  const context = {
    MARGIN_X: 15, A4_WIDTH: 210,
    drawReportHeader() { return 20; },
    ensureSpace(_doc, y) { return y; },
    printLines(_doc, values, _x, y) {
      values.forEach(value => doc.text(value));
      return y + values.length * 5;
    },
    formatDateTime() { return ''; }, formatDate() { return ''; }, formatTime() { return ''; },
    occurrencesByStudent: empty, attendanceCurrentByStudent: empty, attendanceEventsByStudent: empty,
    schoolDailyCurrentByStudent: empty, schoolDailyHistoryByStudent: empty, gradesByStudent: empty,
    livroRevisaByStudent: empty, uniformItemsByStudent: empty,
    livroRevisaTermFor() { return null; },
    window: { decodeObservationValues() { return ['Observação fictícia']; } }
  };
  const renderStudentPage = vm.runInNewContext(`(${source.slice(start, end).trim()})`, context);
  const filters = {
    schoolName: 'Escola Fictícia', emittedAtLabel: '01/01/2026',
    gradesBimester: 3, gradesYear: 2026,
    withObservations: false, withSchoolDailyAttendance: false, withAttendanceHistory: false,
    withGrades: false, withOccurrences: false, withLivroRevisa: false,
    withUniformItems: false, withPhoto: false, ...selected
  };
  await renderStudentPage(doc, student, filters, true);
  return { text: lines.join('\n'), images };
}

(async () => {
  const titles = /OBSERVAÇÕES|FREQUÊNCIA|NOTAS FINAIS DO SIAP|HISTÓRICO DE OCORRÊNCIAS/;
  const none = await render({});
  assert.doesNotMatch(none.text, titles);
  assert.equal(none.images, 0);

  const occurrences = await render({ withOccurrences: true });
  assert.match(occurrences.text, /HISTÓRICO DE OCORRÊNCIAS/);
  assert.doesNotMatch(occurrences.text, /OBSERVAÇÕES|FREQUÊNCIA|NOTAS FINAIS DO SIAP/);

  const teacher = await render({ withAttendanceHistory: true });
  assert.match(teacher.text, /FREQUÊNCIA POR PROFESSOR E DISCIPLINA/);
  assert.match(teacher.text, /HISTÓRICO DE CLASSIFICAÇÃO DA FREQUÊNCIA/);
  assert.doesNotMatch(teacher.text, /FREQUÊNCIA DA SECRETARIA|HISTÓRICO DE OCORRÊNCIAS/);

  const secretary = await render({ withSchoolDailyAttendance: true });
  assert.match(secretary.text, /FREQUÊNCIA DIÁRIA GERAL — SECRETARIA/);
  assert.match(secretary.text, /HISTÓRICO DA FREQUÊNCIA DA SECRETARIA/);
  assert.doesNotMatch(secretary.text, /FREQUÊNCIA POR PROFESSOR E DISCIPLINA|HISTÓRICO DE OCORRÊNCIAS/);

  const grades = await render({ withGrades: true });
  assert.match(grades.text, /NOTAS FINAIS DO SIAP/);
  assert.doesNotMatch(grades.text, /OBSERVAÇÕES|FREQUÊNCIA|HISTÓRICO DE OCORRÊNCIAS/);

  const observationsAndPhoto = await render({ withObservations: true, withPhoto: true });
  assert.match(observationsAndPhoto.text, /OBSERVAÇÕES/);
  assert.equal(observationsAndPhoto.images, 1);
  assert.doesNotMatch(observationsAndPhoto.text, /FREQUÊNCIA|NOTAS FINAIS DO SIAP|HISTÓRICO DE OCORRÊNCIAS/);

  console.log('Seis combinações de seções do PDF verificadas com aluno fictício.');
})().catch(error => { console.error(error); process.exitCode = 1; });
