const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../services/siap-exam/node_modules/@electric-sql/pglite');

const school = '00000000-0000-0000-0000-000000000001';
const otherSchool = '00000000-0000-0000-0000-000000000002';
const creator = '00000000-0000-0000-0000-000000000011';
const contributor = '00000000-0000-0000-0000-000000000012';
const examId = '00000000-0000-0000-0000-000000000021';
const classA = '00000000-0000-0000-0000-000000000031';
const classB = '00000000-0000-0000-0000-000000000032';
const classTwo = '00000000-0000-0000-0000-000000000033';

test('simulado ENEM compartilhado salva lotes, respeita disciplinas e notifica o criador', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.schools(id uuid primary key);
      create table public.classes(id uuid primary key,school_id uuid,name text,archived_at timestamptz);
      create table public.school_members(school_id uuid,user_id uuid,role text,status text);
      create table public.profiles(id uuid,full_name text,email text);
      create table public.class_exams(
        id uuid primary key,school_id uuid,class_id uuid,created_by uuid,
        exam_type text,enem_model text,subject text,title text,academic_year integer,bimester smallint,
        answer_format text check (answer_format in ('ABCD','ABCDE','VF','LIVRE')),
        questions jsonb not null default '[]',finalized_at timestamptz,
        deleted_at timestamptz,deleted_by uuid,updated_at timestamptz default now()
      );
      create table public.students(id uuid primary key,school_id uuid,class_id uuid,enrollment_status text);
      create table public.class_exam_results(
        school_id uuid,exam_id uuid,student_id uuid,reviewed_by uuid,
        answers text[],correct_count smallint,reviewed_at timestamptz
      );
      create table public.user_notifications(recipient_id uuid,school_id uuid,class_id uuid,title text,body text,target_type text,target_id text);
      create function public.class_enem_plan(p_model text) returns jsonb language sql immutable as $$
        select case when p_model='caderno_1' then '[{"subject":"Química","count":2},{"subject":"Física","count":1}]'::jsonb else null end $$;
      create function public.can_create_class_exam(p_school_id uuid) returns boolean language sql stable as $$
        select exists(select 1 from public.school_members m where m.school_id=p_school_id and m.user_id=auth.uid() and m.status='active') $$;
      create function public.cepi_school_enabled(p_school_id uuid) returns boolean language sql stable as $$ select false $$;
      create function public.can_receive_school_notification(p_user_id uuid,p_school_id uuid) returns boolean language sql stable as $$ select true $$;
    `);
    const migration = readFileSync(path.join(__dirname,'../supabase/migrations/196_shared_class_enem_exams.sql'),'utf8');
    await db.exec(migration);
    await db.exec(readFileSync(path.join(__dirname,'../supabase/migrations/197_mixed_class_exam_answers.sql'),'utf8'));
    await db.exec(`
      create trigger class_exam_scope before insert or update on public.class_exams
        for each row execute function public.validate_class_exam();
      create trigger class_exam_result_guard before insert on public.class_exam_results
        for each row execute function public.validate_class_exam_result();
      insert into public.schools values ('${school}'),('${otherSchool}');
      insert into auth.users values ('${creator}','creator@test.local'),('${contributor}','contributor@test.local');
      insert into public.profiles values ('${contributor}','Ana Lima','contributor@test.local');
      insert into public.school_members values ('${school}','${creator}','teacher','active'),('${school}','${contributor}','teacher','active');
      insert into public.classes values ('${classA}','${school}','3A',null),('${classB}','${school}','3B',null),('${classTwo}','${school}','2A',null);
      select set_config('request.jwt.claim.sub','${creator}',false);
      insert into public.class_exams(id,school_id,class_id,created_by,exam_type,enem_model,subject,title,academic_year,bimester,answer_format)
        values ('${examId}','${school}','${classA}','${creator}','enem','caderno_1','Simulado do ENEM','SIMULA - ENEM - CADERNO 1 - 4º BIM',2026,4,'ABCDE');
      select set_config('request.jwt.claim.sub','${contributor}',false);
    `);
    const question = answer => ({ statement: '<!--cepi-rich-v1--><p>Questão de teste com cinco alternativas.</p>', alternatives: {}, correct_answer: answer });
    const add = (subject, questions, targetSchool=school) => db.query(
      'select public.class_exam_add_enem_questions($1,$2,$3,$4::jsonb) as added',
      [targetSchool, examId, subject, JSON.stringify(questions)]
    );
    assert.equal((await add('Física',[question('B')])).rows[0].added,1);
    assert.equal((await add('Química',[question('A'),question('C')])).rows[0].added,2);
    const saved = await db.query('select questions from public.class_exams where id=$1',[examId]);
    assert.deepEqual(saved.rows[0].questions.map(q => q.subject),['Química','Química','Física']);
    assert.ok(saved.rows[0].questions.every(q => q.created_by===contributor));
    const notices = await db.query('select recipient_id,body,target_type,target_id from public.user_notifications order by body');
    assert.equal(notices.rows.length,2);
    assert.ok(notices.rows.some(row => /Ana Lima acaba de inserir 2 questões de Química/.test(row.body)));
    assert.ok(notices.rows.every(row => row.recipient_id===creator && row.target_type==='class_exam' && row.target_id===examId));
    await assert.rejects(add('Química',[question('D')]),/aceita apenas mais 0/);
    await assert.rejects(add('Física',[question('D')],otherSchool),/Sem permissão/);
    assert.equal((await db.query('select jsonb_array_length(questions) as count from public.class_exams where id=$1',[examId])).rows[0].count,3);

    await db.exec(`
      select set_config('request.jwt.claim.sub','${creator}',false);
      update public.class_exams set finalized_at=now() where id='${examId}';
      insert into public.students values
        ('00000000-0000-0000-0000-000000000041','${school}','${classB}','active'),
        ('00000000-0000-0000-0000-000000000042','${school}','${classTwo}','active');
      insert into public.class_exam_results(school_id,exam_id,student_id,reviewed_by,answers)
        values ('${school}','${examId}','00000000-0000-0000-0000-000000000041','${creator}',array['A','C','B']);
    `);
    const result = await db.query('select correct_count from public.class_exam_results');
    assert.equal(result.rows[0].correct_count,3);
    await assert.rejects(db.exec(`insert into public.class_exam_results(school_id,exam_id,student_id,reviewed_by,answers)
      values ('${school}','${examId}','00000000-0000-0000-0000-000000000042','${creator}',array['A','C','B']);`),/3ª série/);
    const mixedId='00000000-0000-0000-0000-000000000060';
    const mixedQuestion=(format,answer,modelAnswer='')=>({statement:'Questão de teste',answer_format:format,alternatives:{},correct_answer:answer,model_answer:modelAnswer});
    await db.query(`insert into public.class_exams(id,school_id,class_id,created_by,exam_type,subject,title,academic_year,bimester,answer_format,questions)
      values ($1,$2,$3,$4,'mensal','Ciências','Prova mista',2026,4,'MISTA',$5::jsonb)`,
      [mixedId,school,classA,creator,JSON.stringify([
        mixedQuestion('ABCDE','E'),mixedQuestion('ABCD','D'),mixedQuestion('VF','V'),mixedQuestion('LIVRE','','Resposta esperada')
      ])]);
    await db.query('update public.class_exams set finalized_at=now() where id=$1',[mixedId]);
    assert.equal((await db.query('select jsonb_array_length(questions) as count from public.class_exams where id=$1',[mixedId])).rows[0].count,4);
    await assert.rejects(db.query(`insert into public.class_exams(id,school_id,class_id,created_by,exam_type,subject,title,academic_year,bimester,answer_format,questions)
      values ($1,$2,$3,$4,'mensal','Ciências','Prova inválida',2026,4,'MISTA',$5::jsonb)`,
      ['00000000-0000-0000-0000-000000000061',school,classA,creator,JSON.stringify([mixedQuestion('VF','E')])]),/Gabarito incompatível/);
    await assert.rejects(db.query(`insert into public.class_exams(id,school_id,class_id,created_by,exam_type,subject,title,academic_year,bimester,answer_format,questions)
      values ($1,$2,$3,$4,'mensal','Ciências','Prova inválida',2026,4,'MISTA',$5::jsonb)`,
      ['00000000-0000-0000-0000-000000000062',school,classA,creator,JSON.stringify([mixedQuestion('LIVRE','')])]),/resposta escrita correta/);
    await db.exec(`
      insert into public.class_exams(id,school_id,class_id,created_by,exam_type,subject,title,academic_year,bimester,answer_format)
        values ('00000000-0000-0000-0000-000000000050','${school}','${classA}','${creator}','mensal','Matemática','Prova mensal',2026,4,'ABCDE');
      grant usage on schema public,auth to authenticated;
      grant select on public.class_exams,public.classes,public.school_members to authenticated;
      alter table public.class_exams enable row level security;
      set role authenticated;
      select set_config('request.jwt.claim.sub','${contributor}',false);
    `);
    const visible = await db.query('select exam_type from public.class_exams order by exam_type');
    assert.deepEqual(visible.rows.map(row => row.exam_type),['enem']);
    await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',false);");
    assert.equal((await db.query('select count(*)::integer as count from public.class_exams')).rows[0].count,0);
  } finally { await db.close(); }
});
