const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '112_cepi_tutoring_foundation.sql'), 'utf8');
const frontend = fs.readFileSync(path.join(root, 'cepi-tutoring.js'), 'utf8');
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
  assert.match(frontend, /Ficha em preparação/);
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
  assert.match(index, /'cepi-tutoring\.js\?v=2'/);
  assert.match(frontend, /cepiNav\.innerHTML = '<span>CEPI<\/span>'/);
  assert.match(frontend, />Tutoria</);
  assert.match(frontend, />Relatório</);
  assert.match(frontend, /Tutor\(a\):/);
  assert.match(frontend, /Conselheiro\(a\):/);
});

test('tutoring PDF contains only the individual form scope', () => {
  assert.match(frontend, /Relatório da Tutoria/);
  assert.match(frontend, /cepi_tutoring_forms/);
  assert.match(frontend, /reference_date,form_schema,answers,status/);
  assert.match(frontend, /datas dos atendimentos e as perguntas e respostas/i);
});
