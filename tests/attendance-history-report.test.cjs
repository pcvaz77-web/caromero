const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const reports=fs.readFileSync(path.join(root,'reports.js'),'utf8');

assert.match(reports,/FALTAS POR DISCIPLINA/);
assert.match(reports,/from\('siap_bimester_absences'\)/);
assert.match(reports,/item\.absences/);
assert.doesNotMatch(reports,/HISTÓRICO DE CLASSIFICAÇÃO DA FREQUÊNCIA/);
assert.doesNotMatch(reports,/report_siap_attendance_events/);
console.log('Relatório mostra faltas por disciplina sem histórico de classificação.');
