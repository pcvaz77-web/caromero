const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {PGlite} = require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('professores escolhidos, primeira impressão e lixeira preservam a prova', async () => {
  const db=new PGlite();
  const school='11111111-1111-4111-8111-111111111111';
  const coordinator='22222222-2222-4222-8222-222222222222';
  const teacher='33333333-3333-4333-8333-333333333333';
  const other='33333333-3333-4333-8333-333333333334';
  const classroom='44444444-4444-4444-8444-444444444444';
  const exam='55555555-5555-4555-8555-555555555555';
  const student='66666666-6666-4666-8666-666666666666';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${coordinator}'),('${teacher}'),('${other}');
      create function auth.uid() returns uuid language sql stable as $$
        select current_setting('app.user_id')::uuid
      $$;
      select set_config('app.user_id','${coordinator}',false);
      create function public.cepi_school_enabled(uuid) returns boolean language sql as $$select true$$;
      create function public.can_receive_school_notification(uuid,uuid) returns boolean language sql as $$select true$$;
      create function public.cepi_block_plan(text,smallint) returns jsonb language sql as $$select null::jsonb$$;
      create table public.classes(id uuid primary key,school_id uuid,archived_at timestamptz);
      create table public.school_members(school_id uuid,user_id uuid,role text,status text);
      create function public.is_cepi_editor(p_school uuid) returns boolean language sql stable as $$
        select exists(select 1 from public.school_members where school_id=p_school and user_id=auth.uid() and status='active' and role in ('coordinator','school_admin','teacher'))
      $$;
      create function public.is_cepi_coordinator(p_school uuid) returns boolean language sql stable as $$
        select exists(select 1 from public.school_members where school_id=p_school and user_id=auth.uid() and status='active' and role in ('coordinator','school_admin'))
      $$;
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
    const migrations=['176_cepi_automatic_test_flow.sql'];
    for(const name of migrations)await db.exec(readFileSync(path.join(__dirname,'..','supabase','migrations',name),'utf8'));
    await db.exec(`
      create trigger cepi_tests_scope before insert or update on public.cepi_tests
        for each row execute function public.validate_cepi_scope();
      create trigger cepi_test_questions_scope before insert or update on public.cepi_test_questions
        for each row execute function public.validate_cepi_scope();
      create trigger cepi_test_results_scope before insert on public.cepi_test_results
        for each row execute function public.validate_cepi_scope();
      create policy cepi_tests_read on public.cepi_tests for select to authenticated using (true);
      create policy cepi_questions_read on public.cepi_test_questions for select to authenticated using (true);
      create policy cepi_questions_insert on public.cepi_test_questions for insert to authenticated with check (true);
      create policy cepi_questions_update on public.cepi_test_questions for update to authenticated using (true);
      create policy cepi_questions_delete on public.cepi_test_questions for delete to authenticated using (true);
      create policy cepi_results_read on public.cepi_test_results for select to authenticated using (true);
      create policy cepi_results_insert on public.cepi_test_results for insert to authenticated with check (true);
    `);
    await db.exec(readFileSync(path.join(__dirname,'..','supabase','migrations','177_cepi_test_assignments_and_trash.sql'),'utf8'));
    await db.exec(`
      insert into public.classes values ('${classroom}','${school}',null);
      insert into public.school_members values
        ('${school}','${coordinator}','coordinator','active'),
        ('${school}','${teacher}','teacher','active'),
        ('${school}','${other}','teacher','active');
      insert into public.students values ('${student}','${school}','${classroom}');
      insert into public.cepi_tests(id,school_id,title,kind,class_ids,academic_year,bimester,stage,question_count,answer_format,subjects,created_by,assigned_teacher_ids)
        values ('${exam}','${school}','PROVA TESTE','bimestral',array['${classroom}'::uuid],2026,3,'fundamental_ii',2,'ABCD',array['Arte'],'${coordinator}',array['${teacher}'::uuid]);
    `);
    let notices=(await db.query('select recipient_id from public.user_notifications')).rows;
    assert.deepEqual(notices.map(row=>row.recipient_id),[teacher]);
    assert.equal((await db.query('select public.is_cepi_test_assigned($1,$2) as assigned',[school,exam])).rows[0].assigned,false);
    await db.query("select set_config('app.user_id',$1,false)",[teacher]);
    assert.equal((await db.query('select public.is_cepi_test_assigned($1,$2) as assigned',[school,exam])).rows[0].assigned,true);
    await db.query("select set_config('app.user_id',$1,false)",[other]);
    assert.equal((await db.query('select public.is_cepi_test_assigned($1,$2) as assigned',[school,exam])).rows[0].assigned,false);
    await db.query("select set_config('app.user_id',$1,false)",[coordinator]);
    for(let number=1;number<=2;number++)await db.query(`
      insert into public.cepi_test_questions(id,school_id,test_id,number,subject,statement,alternatives,correct_answer,created_by)
      values ($1,$2,$3,$4,'Arte','Questão','{}','A',$5)`,
      [`77777777-7777-4777-8777-77777777777${number}`,school,exam,number,teacher]);
    assert.equal((await db.query('select status from public.cepi_tests where id=$1',[exam])).rows[0].status,'ready');
    notices=(await db.query('select recipient_id from public.user_notifications order by title')).rows;
    assert.equal(notices.length,2);
    assert.ok(notices.some(row=>row.recipient_id===coordinator));
    await db.query("update public.cepi_test_questions set statement='Questão revisada' where test_id=$1 and number=1",[exam]);
    await db.query('update public.cepi_tests set print_opened_at=now() where id=$1',[exam]);
    await assert.rejects(db.query("update public.cepi_test_questions set statement='Tarde demais' where test_id=$1 and number=1",[exam]),/Questão, prova ou gabarito incompatível/);
    await db.query('insert into public.cepi_test_results(school_id,test_id,student_id,answers,reviewed_by) values ($1,$2,$3,array[\'A\',\'A\'],$4)',[school,exam,student,teacher]);
    await db.query('update public.cepi_tests set deleted_at=now() where id=$1',[exam]);
    assert.equal((await db.query('select public.is_cepi_test_assigned($1,$2) as assigned',[school,exam])).rows[0].assigned,false);
    assert.equal((await db.query('select count(*)::int as n from public.cepi_test_results')).rows[0].n,1);
    await db.query('update public.cepi_tests set deleted_at=null where id=$1',[exam]);
    assert.equal((await db.query('select deleted_by is null as restored from public.cepi_tests where id=$1',[exam])).rows[0].restored,true);
    await db.query("update public.cepi_tests set status='applied' where id=$1",[exam]);
    await db.query('update public.cepi_tests set deleted_at=now() where id=$1',[exam]);
    await db.query('update public.cepi_tests set deleted_at=null where id=$1',[exam]);
    assert.equal((await db.query('select status from public.cepi_tests where id=$1',[exam])).rows[0].status,'applied');
    await db.exec(`
      grant usage on schema auth to authenticated;
      grant select on public.school_members to authenticated;
      grant select,insert,update,delete on public.cepi_tests,public.cepi_test_questions,public.cepi_test_results to authenticated;
      alter table public.cepi_tests enable row level security;
      alter table public.cepi_test_questions enable row level security;
      alter table public.cepi_test_results enable row level security;
    `);
    await db.query("select set_config('app.user_id',$1,false)",[other]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::int as n from public.cepi_tests')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from public.cepi_test_questions')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int as n from public.cepi_test_results')).rows[0].n,0);
    await db.exec('reset role');
    await db.query("select set_config('app.user_id',$1,false)",[teacher]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::int as n from public.cepi_tests')).rows[0].n,1);
    assert.equal((await db.query('select count(*)::int as n from public.cepi_test_questions')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int as n from public.cepi_test_results')).rows[0].n,1);
    await db.exec('reset role');
    const imported='88888888-8888-4888-8888-888888888888';
    await db.exec(`
      begin;
      select set_config('app.user_id','${coordinator}',false);
      insert into public.cepi_tests(id,school_id,title,kind,class_ids,academic_year,bimester,stage,question_count,answer_format,subjects,created_by)
        values ('${imported}','${school}','PROVA IMPORTADA','bimestral',array['${classroom}'::uuid],2026,3,'fundamental_ii',2,'ABCD',array['Arte'],'${coordinator}');
      update public.cepi_tests set assigned_teacher_ids=array['${teacher}'::uuid] where id='${imported}';
      commit;
    `);
    assert.equal((await db.query('select count(*)::int as n from public.user_notifications where target_id=$1 and recipient_id=$2',[imported,teacher])).rows[0].n,1);
    await assert.rejects(db.query('update public.cepi_tests set assigned_teacher_ids=array[$1::uuid,$1::uuid] where id=$2',[teacher,imported]),/sem repeticao/);
    await db.query("select set_config('app.user_id',$1,false)",[other]);
    await db.exec('set role authenticated');
    await assert.rejects(db.query(`insert into public.cepi_test_questions(id,school_id,test_id,number,subject,statement,alternatives,correct_answer,created_by)
      values ($1,$2,$3,1,'Arte','Questão','{}','A',$4)`,['99999999-9999-4999-8999-999999999991',school,imported,other]),/row-level security policy/);
    await db.exec('reset role');
    await db.query("select set_config('app.user_id',$1,false)",[teacher]);
    await db.exec('set role authenticated');
    await db.query(`insert into public.cepi_test_questions(id,school_id,test_id,number,subject,statement,alternatives,correct_answer,created_by)
      values ($1,$2,$3,1,'Arte','Questão','{}','A',$4)`,['99999999-9999-4999-8999-999999999991',school,imported,teacher]);
    await db.exec('reset role');
  } finally { await db.close(); }
});
