const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pgliteModule = process.env.CAROMETRO_PGLITE_MODULE;
const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/159_attendance_counselor_capture_snapshot.sql'), 'utf8');
const legacyMigration = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/160_conservative_legacy_attendance_source_labels.sql'), 'utf8');
const school = '00000000-0000-0000-0000-000000000010';
const classroom = '00000000-0000-0000-0000-000000000020';
const student = '00000000-0000-0000-0000-000000000030';
const teacher = '00000000-0000-0000-0000-000000000040';

test('papel de conselheiro fica gravado na captura e nao muda com a designacao posterior', {skip: !pgliteModule}, async () => {
  const {PGlite} = require(pgliteModule);
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.profiles(id uuid primary key, full_name text, email text);
      create table public.class_counselors(school_id uuid, class_id uuid, counselor_user_id uuid, created_at timestamptz, updated_at timestamptz);
      create table public.school_siap_attendance_settings(school_id uuid, frequent_minimum integer, absent_minimum integer);
      create table public.siap_attendance_current(
        id uuid primary key, school_id uuid, student_id uuid, class_id uuid,
        percentage integer, academic_year integer, term text, months text[],
        source_dates text[], actor_name text, updated_by uuid, updated_at timestamptz
      );
      create table public.siap_attendance_history(
        id uuid primary key, school_id uuid, student_id uuid, class_id uuid,
        imported_by uuid, imported_at timestamptz
      );
      create table public.siap_school_daily_attendance_current(
        id uuid primary key, school_id uuid, student_id uuid, percentage integer,
        academic_year integer, term text, months text[], source_dates text[],
        updated_at timestamptz
      );
      create function public.is_active_school_member(uuid)
        returns boolean language sql as $$select true$$;
      insert into public.profiles values ('${teacher}','Prof. Exemplo','prof@example.test');
      insert into public.class_counselors values ('${school}','${classroom}','${teacher}','2026-09-01','2026-09-01');
      insert into public.siap_attendance_current values
        ('00000000-0000-0000-0000-000000000050','${school}','${student}',
         '${classroom}',88,2026,'3',array['Setembro'],array['2026-09-01'],
         'Prof. Exemplo','${teacher}','2026-09-02');
      insert into public.profiles values ('00000000-0000-0000-0000-000000000041','Prof. Outro','outro@example.test');
      insert into public.siap_attendance_current values
        ('00000000-0000-0000-0000-000000000051','${school}',
         '00000000-0000-0000-0000-000000000031','${classroom}',
         88,2026,'3',array['Setembro'],array['2026-09-01'],
         'Prof. Outro','00000000-0000-0000-0000-000000000041','2026-09-02');
    `);
    await db.exec(migration);

    // A migracao anterior nao presume o papel dos legados.
    let row = (await db.query(`select was_counselor_at_capture from public.siap_attendance_current
      where id='00000000-0000-0000-0000-000000000050'`)).rows[0];
    assert.equal(row.was_counselor_at_capture, null);
    await db.exec(legacyMigration);
    row = (await db.query(`select was_counselor_at_capture from public.siap_attendance_current
      where id='00000000-0000-0000-0000-000000000050'`)).rows[0];
    assert.equal(row.was_counselor_at_capture, null);
    row = (await db.query(`select was_counselor_at_capture from public.siap_attendance_current
      where id='00000000-0000-0000-0000-000000000051'`)).rows[0];
    assert.equal(row.was_counselor_at_capture, null);
    const otherLabel = (await db.query(`select teacher_is_counselor
      from public.get_effective_siap_attendance_labels_v3('${school}')
      where student_id='00000000-0000-0000-0000-000000000031'`)).rows[0];
    assert.equal(otherLabel.teacher_is_counselor, false);
    const legacyLabel = (await db.query(`select teacher_is_counselor
      from public.get_effective_siap_attendance_labels_v3('${school}')
      where student_id='${student}'`)).rows[0];
    assert.equal(legacyLabel.teacher_is_counselor, false);

    // A primeira importacao nova registra o papel.
    await db.exec(`update public.siap_attendance_current set updated_at='2026-10-01'
      where id='00000000-0000-0000-0000-000000000050'`);
    await db.exec(`insert into public.siap_attendance_history values
      ('00000000-0000-0000-0000-000000000060','${school}','${student}',
       '${classroom}','${teacher}','2026-10-01')`);
    row = (await db.query(`select was_counselor_at_capture from public.siap_attendance_current
      where id='00000000-0000-0000-0000-000000000050'`)).rows[0];
    assert.equal(row.was_counselor_at_capture, true);
    let history = (await db.query('select was_counselor_at_capture from public.siap_attendance_history')).rows[0];
    assert.equal(history.was_counselor_at_capture, true);

    await db.exec('delete from public.class_counselors');
    row = (await db.query(`select teacher_name, teacher_is_counselor
      from public.get_effective_siap_attendance_labels_v3('${school}')
      where student_id='${student}'`)).rows[0];
    assert.equal(row.teacher_name, 'Prof. Exemplo');
    assert.equal(row.teacher_is_counselor, true);

    // Alterar apenas o UUID do autor nao reclassifica uma captura antiga.
    await db.exec(`update public.siap_attendance_current set updated_by=null
      where id='00000000-0000-0000-0000-000000000050'`);
    row = (await db.query(`select was_counselor_at_capture from public.siap_attendance_current
      where id='00000000-0000-0000-0000-000000000050'`)).rows[0];
    assert.equal(row.was_counselor_at_capture, true);

    // Nova importacao depois da troca de conselheiro captura o novo papel.
    await db.exec(`update public.siap_attendance_current
      set updated_by='${teacher}', updated_at='2026-10-02'
      where id='00000000-0000-0000-0000-000000000050'`);
    row = (await db.query(`select was_counselor_at_capture from public.siap_attendance_current
      where id='00000000-0000-0000-0000-000000000050'`)).rows[0];
    assert.equal(row.was_counselor_at_capture, false);
    history = (await db.query('select was_counselor_at_capture from public.siap_attendance_history')).rows[0];
    assert.equal(history.was_counselor_at_capture, true);
  } finally {
    await db.close();
  }
});
