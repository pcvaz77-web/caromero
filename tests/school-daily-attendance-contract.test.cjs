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
assert.match(source, /order\('updated_at',\{ascending:false\}\)/);
assert.match(source, /get_effective_siap_attendance_labels/);
assert.match(source, /effectiveBadges\.set\(item\.student_id/);
assert.match(source, /import_siap_school_daily_attendance/);
assert.match(source, /school_day_count:row\.days/);
assert.match(source, /presences:row\.presences/);
assert.match(source, /absences:row\.absences/);
assert.match(source, /30 \* 60 \* 1000/);
assert.match(source, /Capturando frequência do SIAP/);
assert.match(source, /data-sda-capture/);
assert.match(source, /setCaptureActive\(true\)/);
assert.match(source, /setCaptureActive\(false\)/);
assert.match(source, /class="meta sda-context"/);
assert.match(source, /\.sda-context\{[^}]*font-size:15px!important;[^}]*font-weight:850!important/);
assert.match(source, /collectionPeriodLabel/);
assert.match(source, /collection\.datesRead/);
assert.match(source, /monthNames\.length === 1/);
assert.match(source, /matchingTerms\.length === 1/);
assert.match(source, /from\('school_terms'\)\.select\('bimester,starts_on,ends_on'\)/);
assert.match(source, /Intl\.ListFormat\('pt-BR'/);
assert.doesNotMatch(source, /\$\{collection\.context\.term\}.*data-sda-context/);
assert.match(source, /carometro-frequencia-leitura-0\.7\.0\.zip/);
assert.match(source, /getSchoolDailyAttendanceStatus/);
assert.match(source, /getStudentAttendanceDetails/);
assert.match(source, /source_key==='teacher'/);
assert.match(source, /Professor conselheiro/);
assert.match(source, /effectivePeriod\(item\)/);
assert.match(source, /select\('school_year,bimester,starts_on,ends_on'\)/);
assert.match(index, /<strong>Fonte:<\/strong>/);
assert.doesNotMatch(source, /statuses\.sort/);
assert.match(index, /school-daily-attendance\.js\?v=8/);

const cleanNameExpression = source.match(/const cleanName = ([^;]+);/)?.[1];
const normalizeNameExpression = source.match(/const normalizeName = ([^;]+);/)?.[1];
assert.ok(cleanNameExpression && normalizeNameExpression);
const sandbox = {};
vm.runInNewContext(`const cleanName = ${cleanNameExpression}; const normalizeName = ${normalizeNameExpression}; globalThis.normalizeNameForTest = normalizeName;`, sandbox);
assert.equal(sandbox.normalizeNameForTest('12. João da Silva'), 'joao da silva');
assert.equal(sandbox.normalizeNameForTest('JOÃO DA SILVA - 12'), 'joao da silva');
assert.equal(sandbox.normalizeNameForTest('João 2 Santos'), 'joao santos');

const periodUtilitiesStart = source.indexOf('const formatMonthList');
const periodUtilitiesEnd = source.indexOf('\n\n  async function loadSchoolTerms');
assert.ok(periodUtilitiesStart >= 0 && periodUtilitiesEnd > periodUtilitiesStart);
const periodUtilities = source.slice(periodUtilitiesStart, periodUtilitiesEnd);
const periodSandbox = {};
vm.runInNewContext(`
  const MONTHS = ${JSON.stringify(['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])};
  let collection = null;
  let schoolTerms = [];
  ${periodUtilities}
  globalThis.describePeriod = (nextCollection,nextTerms=[]) => {
    collection = nextCollection;
    schoolTerms = nextTerms;
    return collectionPeriodLabel();
  };
`, periodSandbox);
assert.equal(periodSandbox.describePeriod({ datesRead:['02/09/2026','18/09/2026'], months:['Setembro'] }), 'Setembro');
assert.equal(periodSandbox.describePeriod(
  { datesRead:['10/08/2026','15/09/2026'], months:['Agosto','Setembro'] },
  [{ bimester:3, starts_on:'2026-08-01', ends_on:'2026-09-30' }]
), '3º bimestre');
assert.equal(periodSandbox.describePeriod(
  { datesRead:['10/08/2026','15/10/2026'], months:['Agosto','Outubro'] },
  [{ bimester:3, starts_on:'2026-08-01', ends_on:'2026-09-30' }, { bimester:4, starts_on:'2026-10-01', ends_on:'2026-12-20' }]
), 'Agosto e Outubro');

const effectivePeriodStart = source.indexOf('const orderedMonths');
const effectivePeriodEnd = source.indexOf('\n\n  async function loadAttendanceTerms');
assert.ok(effectivePeriodStart >= 0 && effectivePeriodEnd > effectivePeriodStart);
const effectivePeriodUtilities = source.slice(effectivePeriodStart,effectivePeriodEnd);
const effectivePeriodSandbox = {};
vm.runInNewContext(`
  const MONTHS = ${JSON.stringify(['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])};
  const formatMonthList = months => new Intl.ListFormat('pt-BR',{style:'long',type:'conjunction'}).format(months);
  let attendanceTermsByYear = new Map();
  ${effectivePeriodUtilities}
  globalThis.describeEffectivePeriod = (item,terms=[]) => {
    attendanceTermsByYear = new Map([[Number(item.academic_year),terms]]);
    return effectivePeriod(item);
  };
`, effectivePeriodSandbox);
const thirdTerm={bimester:3,starts_on:'2026-08-01',ends_on:'2026-09-30'};
const fourthTerm={bimester:4,starts_on:'2026-10-01',ends_on:'2026-12-20'};
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Setembro']},[thirdTerm]),'3º bimestre');
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Agosto','Outubro']},[thirdTerm,fourthTerm]),'3º e 4º bimestres');
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Agosto','Setembro']}),'Agosto e Setembro');
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Setembro','Dezembro']},[thirdTerm]),'Setembro e Dezembro');

console.log('Carômetro: fluxo da Frequência da Secretaria e vínculo nominal aprovados.');
