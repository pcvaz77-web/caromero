const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '112_cepi_tutoring_foundation.sql'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'cepi-tutoring.js'), 'utf8');
const realtime = fs.readFileSync(path.join(root, 'realtime-sync.js'), 'utf8');
const realtimeMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '113_cepi_realtime_visibility.sql'), 'utf8');
const managementMigration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '114_cepi_tutor_management.sql'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('CEPI is enabled per school by the platform owner', () => {
  assert.match(migration, /create table public\.school_cepi_settings/i);
  assert.match(migration, /platform_set_cepi_enabled\(p_school_id uuid, p_enabled boolean\)/i);
  assert.match(migration, /if not public\.is_platform_owner\(\)/i);
  assert.match(migration, /record_platform_audit/i);
  assert.match(frontend, /button\.dataset\.platformPage = 'cepi'/);
  assert.match(frontend, /A liberação é independente do plano contratado/);
});

test('tutoring records internal and external tutors without creating access', () => {
  assert.match(migration, /tutor_type in \('internal', 'external'\)/i);
  assert.match(migration, /tutor_type = 'external' and member_id is null/i);
  assert.match(migration, /member_id uuid null references public\.school_members\(id\) on delete set null/i);
  assert.match(frontend, /Sem acesso ao CARÔMETRO/);
  assert.match(frontend, /não receberá acesso nem notificação/i);
});

test('assignments and forms are school scoped and history preserving', () => {
  assert.match(migration, /create table public\.cepi_tutor_students/i);
  assert.match(migration, /one_active_tutor_idx/i);
  assert.match(migration, /references public\.students\(id\) on delete restrict/i);
  assert.match(migration, /form_schema jsonb not null default '\[\]'::jsonb/i);
  assert.match(migration, /answers jsonb not null default '\{\}'::jsonb/i);
  assert.match(frontend, /O histórico será preservado/);
  assert.match(frontend, /Nova ficha/);
  assert.match(frontend, /Histórico/);
  assert.match(migration, /can_access_cepi_student/i);
  assert.match(migration, /get_cepi_tutored_student_activity/i);
});

test('internal tutors receive a school-scoped notification', () => {
  assert.match(migration, /create or replace function public\.notify_cepi_tutor_assignment/i);
  assert.match(migration, /insert into public\.user_notifications/i);
  assert.match(migration, /'Novo tutorando'/);
  assert.match(migration, /new\.school_id/);
});

test('CEPI frontend is loaded explicitly', () => {
  assert.match(index, /'cepi-tutoring\.js\?v=8'/);
  assert.match(frontend, /cepiNav\.innerHTML = '<span>CEPI<\/span>'/);
  assert.match(frontend, />Tutoria</);
  assert.match(frontend, />Relatório</);
  assert.match(frontend, /Tutor\(a\):/);
  assert.match(frontend, /Conselheiro\(a\):/);
});

test('CEPI lists and dialogs provide the requested filters', () => {
  for (const id of ['cepiAssignmentClass', 'cepiAssignmentName', 'cepiTutorFilter', 'cepiStudentFilter', 'cepiClassFilter', 'cepiReportTutor', 'cepiReportName', 'cepiReportClass']) {
    assert.match(frontend, new RegExp(`id=["']${id}["']`));
  }
  assert.match(frontend, /normalizeSearch/);
  assert.match(frontend, /renderReportStudents/);
});

test('tutor editing, removal and transfer preserve assignment history', () => {
  assert.match(frontend, /data-edit-tutor/);
  assert.match(frontend, /data-remove-tutor/);
  assert.match(frontend, /data-transfer-assignment/);
  assert.match(managementMigration, /create or replace function public\.update_cepi_tutor/i);
  assert.match(managementMigration, /create or replace function public\.deactivate_cepi_tutor/i);
  assert.match(managementMigration, /create or replace function public\.transfer_cepi_student/i);
  assert.match(managementMigration, /set active = false, ended_at = now\(\), ended_by = auth\.uid\(\)/i);
});

test('tutoring PDF contains only the individual form scope', () => {
  assert.match(frontend, /Relatório da Tutoria/);
  assert.match(frontend, /cepi_tutoring_forms/);
  assert.match(frontend, /reference_date,form_schema,answers,status/);
  assert.match(frontend, /datas dos atendimentos e as perguntas e respostas/i);
  assert.match(frontend, /include_in_report !== false/);
});

test('individual tutoring form follows the official CEPI model', () => {
  assert.match(frontend, /Iniciação Científica \(EF\)/);
  assert.match(frontend, /Projeto de Vida \(EM\)/);
  assert.match(frontend, /Projeto de Eletiva — 1º bimestre/);
  assert.match(frontend, /Projeto de Eletiva — 4º bimestre/);
  assert.match(frontend, /PJ — 1º bimestre/);
  assert.match(frontend, /PJ — 4º bimestre/);
  assert.match(frontend, /Pessoal — Aprender a ser/);
  assert.match(frontend, /Social-relacional — Aprender a conviver/);
  assert.match(frontend, /Cognitiva — Aprender a conhecer/);
  assert.match(frontend, /Produtiva — Aprender a fazer/);
  assert.match(frontend, /Dificuldade identificada/);
  assert.match(frontend, /O registro foi lido e discutido com o tutorando/);
  assert.match(frontend, /Salvar rascunho/);
  assert.match(frontend, /status === 'completed'/);
});

test('internal tutor notes are excluded from the PDF schema', () => {
  assert.match(frontend, /id:'internal_notes'.*include_in_report:false/);
  assert.match(frontend, /não aparecem no PDF/i);
});

test('tutor groups can collapse and student photos are enlarged', () => {
  assert.match(frontend, /const collapsedTutorIds = new Set\(\)/);
  assert.match(frontend, /data-toggle-tutor/);
  assert.match(frontend, /Retrair lista/);
  assert.match(frontend, /Expandir lista/);
  assert.match(frontend, /\.cepi-student-photo\{width:84px;height:84px/);
  assert.match(frontend, /\.cepi-student-photo\{width:68px;height:68px/);
});

test('individual form and student details show contextual labels', () => {
  assert.match(frontend, /cepiFormStudentName/);
  assert.match(frontend, /studentPinnedLabels/);
  assert.match(frontend, /student-tutor-detail-label/);
  assert.match(frontend, /counselor\.insertAdjacentElement\('afterend', label\)/);
});

test('CEPI visibility updates without logout or manual reload', () => {
  assert.match(realtimeMigration, /emit_cepi_setting_change_realtime_event/i);
  assert.match(realtimeMigration, /execute function public\.emit_school_realtime_event\(\)/i);
  assert.match(realtime, /school_cepi_settings.*carometro:cepi-settings-changed/);
  assert.match(frontend, /carometro:cepi-settings-changed/);
  assert.match(frontend, /setInterval[\s\S]*2500/);
  assert.match(frontend, /cepiNav\.classList\.toggle\('hidden', access\.enabled !== true\)/);
});
