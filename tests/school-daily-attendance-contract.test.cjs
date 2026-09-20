const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'school-daily-attendance.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const partialPeriodMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '135_attendance_partial_period_labels.sql'), 'utf8');

assert.match(source, /Frequência da Secretaria/);
assert.match(source, /permission\?\.is_secretary === true && permission\?\.can_import_school_daily_attendance === true/);
assert.doesNotMatch(source, /permission\?\.role === 'admin' \|\|/);
assert.match(source, /cleanName/);
assert.match(source, /normalizeName/);
assert.match(source, /localMatches\.length === 1/);
assert.match(source, /globalMatches\.length === 1/);
assert.match(source, /row\.sourceDuplicate/);
assert.match(source, /siap_school_daily_attendance_current/);
assert.match(source, /order\('updated_at',\{ascending:false\}\)/);
assert.match(source, /get_effective_siap_attendance_labels_v2/);
assert.match(source, /effectiveBadges\.set\(item\.student_id/);
assert.match(source, /months,source_dates,updated_at/);
assert.match(partialPeriodMigration, /add column if not exists source_dates text\[\]/);
assert.match(partialPeriodMigration, /sync_siap_attendance_current_source_dates/);
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
assert.match(source, /monthNames\.length<=1/);
assert.match(source, /TERM_BOUNDARY_TOLERANCE_DAYS/);
assert.match(source, /período parcial/);
assert.match(source, /from\('school_terms'\)\.select\('bimester,starts_on,ends_on'\)/);
assert.match(source, /Intl\.ListFormat\('pt-BR'/);
assert.doesNotMatch(source, /\$\{collection\.context\.term\}.*data-sda-context/);
assert.match(source, /attendanceCaptureStoreUrl/);
assert.match(source, /carometro-frequencia-leitura\/knidplehphfpgaeeogjpfldhgbfkogbc/);
assert.match(source, /extensionLink\.removeAttribute\('download'\)/);
assert.match(source, /extensionLink\.classList\.add\('primary'\)/);
assert.match(source, /Instalar o capturador de frequência/);
assert.match(source, /getSchoolDailyAttendanceStatus/);
assert.match(source, /getStudentAttendanceDetails/);
assert.match(source, /source_key==='teacher'/);
assert.match(source, /Professor conselheiro/);
assert.match(source, /effectivePeriod\(item\)/);
assert.match(source, /select\('school_year,bimester,starts_on,ends_on'\)/);
assert.match(source, /percentage:item\.percentage/);
assert.match(source, /\.attendance-percentage-ring\{/);
assert.match(source, /conic-gradient\(var\(--attendance-color\)/);
assert.match(source, /<span class="attendance-badge \$\{status\.className\}">\$\{status\.label\}<\/span>/);
assert.doesNotMatch(source, /shortPeriod/);
assert.match(index, /<strong>Fonte:<\/strong>/);
assert.doesNotMatch(source, /statuses\.sort/);
assert.match(source, /carometro:school-context-ready', reloadActiveSchoolAttendance/);
assert.match(source, /carometro:data-loaded', loadEffectiveBadges/);
assert.match(index, /school-daily-attendance\.js\?v=17/);

const cleanNameExpression = source.match(/const cleanName = ([^;]+);/)?.[1];
const normalizeNameExpression = source.match(/const normalizeName = ([^;]+);/)?.[1];
assert.ok(cleanNameExpression && normalizeNameExpression);
const sandbox = {};
vm.runInNewContext(`const cleanName = ${cleanNameExpression}; const normalizeName = ${normalizeNameExpression}; globalThis.normalizeNameForTest = normalizeName;`, sandbox);
assert.equal(sandbox.normalizeNameForTest('12. João da Silva'), 'joao da silva');
assert.equal(sandbox.normalizeNameForTest('JOÃO DA SILVA - 12'), 'joao da silva');
assert.equal(sandbox.normalizeNameForTest('João 2 Santos'), 'joao santos');

const sharedPeriodUtilitiesStart = source.indexOf('function parseReadDate');
const collectionPeriodStart = source.indexOf('function collectionPeriodLabel');
const sharedPeriodUtilitiesEnd = collectionPeriodStart;
const collectionPeriodEnd = source.indexOf('async function loadSchoolTerms', collectionPeriodStart);
assert.ok(sharedPeriodUtilitiesStart >= 0 && sharedPeriodUtilitiesEnd > sharedPeriodUtilitiesStart);
assert.ok(collectionPeriodStart >= 0 && collectionPeriodEnd > collectionPeriodStart);
const sharedPeriodUtilities = source.slice(sharedPeriodUtilitiesStart, sharedPeriodUtilitiesEnd);
const collectionPeriodUtility = source.slice(collectionPeriodStart, collectionPeriodEnd);
const periodSandbox = {};
vm.runInNewContext(`
  const MONTHS = ${JSON.stringify(['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])};
  const TERM_BOUNDARY_TOLERANCE_DAYS = 7;
  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  const formatMonthList = months => new Intl.ListFormat('pt-BR',{style:'long',type:'conjunction'}).format(months);
  let collection = null;
  let schoolTerms = [];
  ${sharedPeriodUtilities}
  ${collectionPeriodUtility}
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
), 'Agosto e Setembro — período parcial');
assert.equal(periodSandbox.describePeriod(
  { datesRead:['03/08/2026','29/09/2026'], months:['Agosto','Setembro'] },
  [{ bimester:3, starts_on:'2026-08-01', ends_on:'2026-09-30' }]
), '3º bimestre');
assert.equal(periodSandbox.describePeriod(
  { datesRead:['10/08/2026','15/10/2026'], months:['Agosto','Outubro'] },
  [{ bimester:3, starts_on:'2026-08-01', ends_on:'2026-09-30' }, { bimester:4, starts_on:'2026-10-01', ends_on:'2026-12-20' }]
), 'Agosto e Outubro — período parcial');
assert.equal(periodSandbox.describePeriod(
  { datesRead:['21/02/2026','15/03/2026','04/04/2026'], months:['Fevereiro','Março','Abril'] },
  [{ bimester:1, starts_on:'2026-02-20', ends_on:'2026-04-05' }]
), '1º bimestre');
assert.equal(periodSandbox.describePeriod(
  { datesRead:['21/02/2026','04/04/2026'], months:['Fevereiro','Abril'] },
  [{ bimester:1, starts_on:'2026-02-20', ends_on:'2026-04-05' }]
), 'Fevereiro e Abril — período parcial');

const effectivePeriodStart = source.indexOf('const orderedMonths');
const effectivePeriodEnd = source.indexOf('async function loadAttendanceTerms', effectivePeriodStart);
assert.ok(effectivePeriodStart >= 0 && effectivePeriodEnd > effectivePeriodStart);
const effectivePeriodUtilities = source.slice(effectivePeriodStart,effectivePeriodEnd);
const effectivePeriodSandbox = {};
vm.runInNewContext(`
  const MONTHS = ${JSON.stringify(['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])};
  const TERM_BOUNDARY_TOLERANCE_DAYS = 7;
  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  const formatMonthList = months => new Intl.ListFormat('pt-BR',{style:'long',type:'conjunction'}).format(months);
  let attendanceTermsByYear = new Map();
  ${sharedPeriodUtilities}
  ${effectivePeriodUtilities}
  globalThis.describeEffectivePeriod = (item,terms=[]) => {
    attendanceTermsByYear = new Map([[Number(item.academic_year),terms]]);
    return effectivePeriod(item);
  };
`, effectivePeriodSandbox);
const thirdTerm={bimester:3,starts_on:'2026-08-01',ends_on:'2026-09-30'};
const fourthTerm={bimester:4,starts_on:'2026-10-01',ends_on:'2026-12-20'};
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Setembro'],source_dates:['02/09/2026','18/09/2026']},[thirdTerm]),'Setembro');
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Agosto','Setembro'],source_dates:['03/08/2026','29/09/2026']},[thirdTerm]),'3º bimestre');
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Agosto','Setembro'],source_dates:['10/08/2026','15/09/2026']},[thirdTerm]),'Agosto e Setembro — período parcial');
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Agosto','Outubro'],source_dates:['10/08/2026','15/10/2026']},[thirdTerm,fourthTerm]),'Agosto e Outubro — período parcial');
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Fevereiro','Março','Abril'],source_dates:['21/02/2026','15/03/2026','04/04/2026']},[{bimester:1,starts_on:'2026-02-20',ends_on:'2026-04-05'}]),'1º bimestre');
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Fevereiro','Abril'],source_dates:['21/02/2026','04/04/2026']},[{bimester:1,starts_on:'2026-02-20',ends_on:'2026-04-05'}]),'Fevereiro e Abril — período parcial');
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Agosto','Setembro']}),'Agosto e Setembro');
assert.equal(effectivePeriodSandbox.describeEffectivePeriod({academic_year:2026,months:['Setembro','Dezembro']},[thirdTerm]),'Setembro e Dezembro');

console.log('Carômetro: fluxo da Frequência da Secretaria e vínculo nominal aprovados.');
