const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const reports = fs.readFileSync(path.join(root, 'reports.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(reports, /name="reportAttendanceSource" id="reportAttendanceTeacher" value="teacher" checked> Professor\/disciplina/);
assert.match(reports, /name="reportAttendanceSource" id="reportAttendanceSecretary" value="secretary"> Secretaria/);
assert.match(reports, /name="reportAttendanceSource" id="reportAttendanceNone" value="none"> Não incluir/);
assert.match(reports, /class="reports-options-grid"/);
assert.match(reports, /<legend>Informações gerais<\/legend>/);
assert.match(reports, /<legend>Frequência<\/legend>/);
assert.match(reports, /<legend>Recebimentos<\/legend>/);
assert.match(reports, /reports-choice-list-students/);
assert.match(reports, /withAttendanceHistory: attendanceSource === 'teacher'/);
assert.match(reports, /withSchoolDailyAttendance: attendanceSource === 'secretary'/);
assert.match(reports, /withSchoolDailyAttendance/);
assert.match(reports, /siap_school_daily_attendance_current/);
assert.match(reports, /siap_school_daily_attendance_history/);
assert.match(reports, /\.eq\('school_id', filters\.schoolId\)/);
assert.match(reports, /FREQUÊNCIA DIÁRIA GERAL — SECRETARIA/);
assert.match(reports, /HISTÓRICO DA FREQUÊNCIA DA SECRETARIA/);
assert.match(reports, /Dias letivos: \$\{item\.school_day_count\}/);
assert.match(reports, /school_daily_attendance: filters\.withSchoolDailyAttendance/);
assert.match(index, /reports\.js\?v=17/);
assert.ok(reports.indexOf('FREQUÊNCIA DIÁRIA GERAL — SECRETARIA') < reports.indexOf('FREQUÊNCIA POR PROFESSOR E DISCIPLINA'));

console.log('Relatório exige escolha única entre frequência do professor e da Secretaria.');
