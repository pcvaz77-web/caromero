const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('última questão conclui a prova, avisa a coordenação e permite corrigir sem marcar aplicação', async () => {
  const db = new PGlite();
  const school = '11111111-1111-4111-8111-111111111111';
  const coordinator = '22222222-2222-4222-8222-222222222222';
  const teacher = '33333333-3333-4333-8333-333333333333';
  const classroom = '44444444-4444-4444-8444-444444444444';
  const exam = '55555555-5555-4555-8555-555555555555';
  const student = '66666666-6666-4666-8666-666666666666';
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select '${coordinator}'::uuid
      $$;
      create function public.cepi_school_enabled(uuid) returns boolean language sql as $$select true$$;
      create function public.is_cepi_coordinator(uuid) returns boolean language sql as $$select true$$;
      create function public.can_receive_school_notification(uuid,uuid) returns boolean language sql as $$select true$$;
      create function public.cepi_block_plan(text,smallint) returns jsonb language sql as $$select null::jsonb$$;
      create table public.classes(id uuid primary key, school_id uuid, archived_at timestamptz);
      create table public.school_members(school_id uuid,user_id uuid,role text,status text);
      create table public.cepi_tests(
        id uuid primary key,school_id uuid,title text,kind text,class_ids uuid[],block_number smallint,
        subject_plan jsonb default '[]',academic_year int,bimester smallint,stage text,
        scheduled_on date,question_count smallint,answer_format text,subjects text[],
        status text default 'draft',notes text,created_by uuid,updated_at timestamptz
      );
      create table public.cepi_test_questions(
        id uuid primary key,school_id uuid,test_id uuid,number smallint,subject text,
        statement text,alternatives jsonb,correct_answer text,bank_question_id uuid,
        created_by uuid,updated_at timestamptz
      );
      create table public.students(id uuid,school_id uuid,class_id uuid);
      create table public.cepi_test_results(
        school_id uuid,test_id uuid,student_id uuid,answers text[],reviewed_by uuid,reviewed_at timestamptz
      );
      create table public.user_notifications(
        recipient_id uuid,school_id uuid,title text,body text,target_type text,target_id text
      );
    `);
    const migration = readFileSync(path.join(__dirname,'..','supabase','migrations','176_cepi_automatic_test_flow.sql'),'utf8');
    await db.exec(migration);
    await db.exec(`
      create trigger cepi_tests_scope before insert or update on public.cepi_tests
        for each row execute function public.validate_cepi_scope();
      create trigger cepi_test_questions_scope before insert or update on public.cepi_test_questions
        for each row execute function public.validate_cepi_scope();
      create trigger cepi_test_results_scope before insert on public.cepi_test_results
        for each row execute function public.validate_cepi_scope();
      insert into public.classes(id,school_id) values ('${classroom}','${school}');
      insert into public.school_members values
        ('${school}','${coordinator}','coordinator','active'),
        ('${school}','${teacher}','teacher','active');
      insert into public.students values ('${student}','${school}','${classroom}');
      insert into public.cepi_tests(id,school_id,title,kind,class_ids,academic_year,bimester,stage,question_count,answer_format,subjects,created_by)
        values ('${exam}','${school}','PROVA BIMESTRAL','bimestral',array['${classroom}'::uuid],2026,3,'fundamental_ii',2,'ABCD',array['Língua Portuguesa'],'${coordinator}');
    `);
    let rows = (await db.query('select recipient_id,title from public.user_notifications')).rows;
    assert.deepEqual(rows.map(row=>row.recipient_id),[teacher]);
    for (let number=1;number<=2;number++) {
      await db.query(`insert into public.cepi_test_questions(id,school_id,test_id,number,subject,statement,alternatives,correct_answer,created_by)
        values ($1,$2,$3,$4,'Língua Portuguesa','Questão de exemplo','{}','A',$5)`,
        [`77777777-7777-4777-8777-77777777777${number}`,school,exam,number,teacher]);
      const status=(await db.query('select status from public.cepi_tests where id=$1',[exam])).rows[0].status;
      assert.equal(status,number===1?'draft':'ready');
    }
    rows=(await db.query('select recipient_id,title from public.user_notifications order by title')).rows;
    assert.equal(rows.length,2);
    assert.ok(rows.some(row=>row.recipient_id===coordinator && row.title.includes('Questões completas')));
    await db.query(`insert into public.cepi_test_results(school_id,test_id,student_id,answers,reviewed_by)
      values ($1,$2,$3,array['A','B'],$4)`,[school,exam,student,teacher]);
    assert.equal((await db.query('select count(*)::int as count from public.cepi_test_results')).rows[0].count,1);

    const imported = '88888888-8888-4888-8888-888888888888';
    await db.exec(`
      begin;
      insert into public.cepi_tests(id,school_id,title,kind,class_ids,academic_year,bimester,stage,question_count,answer_format,subjects,created_by)
        values ('${imported}','${school}','PROVA IMPORTADA','bimestral',array['${classroom}'::uuid],2026,3,'fundamental_ii',2,'ABCD',array['Língua Portuguesa'],'${coordinator}');
      insert into public.cepi_test_questions(id,school_id,test_id,number,subject,statement,alternatives,correct_answer,created_by)
        values
        ('99999999-9999-4999-8999-999999999991','${school}','${imported}',1,'Língua Portuguesa','Primeira questão','{}','A','${coordinator}'),
        ('99999999-9999-4999-8999-999999999992','${school}','${imported}',2,'Língua Portuguesa','Segunda questão','{}','B','${coordinator}');
      commit;
    `);
    assert.equal((await db.query('select status from public.cepi_tests where id=$1',[imported])).rows[0].status,'ready');
    const importedNotices=(await db.query('select recipient_id from public.user_notifications where target_id=$1',[imported])).rows;
    assert.deepEqual(importedNotices.map(row=>row.recipient_id),[coordinator]);
  } finally { await db.close(); }
});
