const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const reports=fs.readFileSync(path.join(root,'reports.js'),'utf8');

assert.match(reports,/reportContentAttendanceHistory/);
assert.match(reports,/report_siap_attendance_current/);
assert.match(reports,/report_siap_attendance_events/);
assert.match(reports,/SITUAÇÃO ATUAL POR DISCIPLINA E PROFESSOR/);
assert.match(reports,/Professor: \$\{item\.teacher_name\}/);
assert.match(reports,/HISTÓRICO DE CLASSIFICAÇÃO DA FREQUÊNCIA/);
assert.match(reports,/formatDateTime\(event\.changed_at\)/);
assert.match(reports,/Mudou de \$\{from\} para \$\{to\}/);
assert.match(reports,/Voltou a Frequente; etiqueta removida dos cards/);
assert.match(reports,/Importação por \$\{event\.teacher_name\}/);
assert.doesNotMatch(reports,/formatDate\(event\.source/);
console.log('Relatório usa a data da mudança no Carômetro e preserva a linha do tempo das etiquetas.');
