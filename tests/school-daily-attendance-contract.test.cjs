const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'school-daily-attendance.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(source, /Frequência da Secretaria/);
assert.match(source, /permission\?\.role === 'admin' \|\| \(permission\?\.is_secretary === true && permission\?\.can_import_school_daily_attendance === true\)/);
assert.match(source, /cleanName/);
assert.match(source, /normalizeName/);
assert.match(source, /localMatches\.length === 1/);
assert.match(source, /globalMatches\.length === 1/);
assert.match(source, /row\.sourceDuplicate/);
assert.match(source, /siap_school_daily_attendance_current/);
assert.match(source, /import_siap_school_daily_attendance/);
assert.match(source, /school_day_count:row\.days/);
assert.match(source, /presences:row\.presences/);
assert.match(source, /absences:row\.absences/);
assert.match(source, /30 \* 60 \* 1000/);
assert.match(source, /carometro-frequencia-leitura-0\.7\.0\.zip/);
assert.match(source, /getSchoolDailyAttendanceStatus/);
assert.match(source, /teacherStatus\?\.\(studentId\)/);
assert.match(index, /school-daily-attendance\.js\?v=2/);

const cleanNameExpression = source.match(/const cleanName = ([^;]+);/)?.[1];
const normalizeNameExpression = source.match(/const normalizeName = ([^;]+);/)?.[1];
assert.ok(cleanNameExpression && normalizeNameExpression);
const sandbox = {};
vm.runInNewContext(`const cleanName = ${cleanNameExpression}; const normalizeName = ${normalizeNameExpression}; globalThis.normalizeNameForTest = normalizeName;`, sandbox);
assert.equal(sandbox.normalizeNameForTest('12. João da Silva'), 'joao da silva');
assert.equal(sandbox.normalizeNameForTest('JOÃO DA SILVA - 12'), 'joao da silva');
assert.equal(sandbox.normalizeNameForTest('João 2 Santos'), 'joao santos');

console.log('Carômetro: fluxo da Frequência da Secretaria e vínculo nominal aprovados.');
