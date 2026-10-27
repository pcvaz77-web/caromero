const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {PGlite} = require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('prova bimestral fica na turma e só o autor pode editá-la', async () => {
  const db = new PGlite();
  const schoolA = '11111111-1111-4111-8111-111111111111';
  const schoolB = '11111111-1111-4111-8111-111111111112';
  const classA = '22222222-2222-4222-8222-222222222221';
  const classB = '22222222-2222-4222-8222-222222222222';
  const teacherA = '33333333-3333-4333-8333-333333333331';
  const teacherB = '33333333-3333-4333-8333-333333333332';
  const coordinator = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select current_setting('app.user_id')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      create table auth.users(id uuid primary key);
      create table public.schools(id uuid primary key);
      create table public.classes(id uuid primary key,school_id uuid not null,archived_at timestamptz);
      create table public.school_members(school_id uuid not null,user_id uuid not null,role text not null,status text not null);
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit integer,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      create function storage.foldername(path text) returns text[] language sql immutable as $$ select string_to_array(path,'/') $$;
      insert into auth.users values ('${teacherA}'),('${teacherB}'),('${coordinator}');
      insert into public.schools values ('${schoolA}'),('${schoolB}');
      insert into public.classes values ('${classA}','${schoolA}',null),('${classB}','${schoolB}',null);
      insert into public.school_members values
        ('${schoolA}','${teacherA}','teacher','active'),
        ('${schoolA}','${teacherB}','teacher','active'),
        ('${schoolA}','${coordinator}','coordinator','active');
    `);
    await db.exec(readFileSync(path.join(__dirname,'..','supabase/migrations/188_class_exams.sql'),'utf8'));
    await db.exec(readFileSync(path.join(__dirname,'..','supabase/migrations/189_class_exam_editor_and_headers.sql'),'utf8'));
    const as = user => db.query('select set_config($1,$2,false)', ['app.user_id',user]);
    const base = { school_id:schoolA,class_id:classA,created_by:teacherA,exam_type:'bimestral',subject:'Ciências',title:'Prova bimestral',academic_year:2026,bimester:4,answer_format:'ABCDE',questions:[{statement:'Qual é a resposta?',correct_answer:'C'}] };
    await as(teacherA);
    const created = await db.query('insert into public.class_exams (school_id,class_id,created_by,exam_type,subject,title,academic_year,bimester,answer_format,questions) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id',Object.values(base));
    const id = created.rows[0].id;
    const longQuestions = Array.from({length:120},(_,index)=>({statement:`Questão ${index+1}: enunciado completo`,correct_answer:'A'}));
    await db.query('update public.class_exams set questions=$1 where id=$2',[JSON.stringify(longQuestions),id]);
    assert.equal((await db.query('select jsonb_array_length(questions) as n from public.class_exams where id=$1',[id])).rows[0].n,120,'prova comum sem limite de 99 questões');
    await db.query('update public.class_exams set questions=$1 where id=$2',[JSON.stringify(base.questions),id]);
    const monthly = await db.query("insert into public.class_exams (school_id,class_id,created_by,exam_type,subject,title,academic_year,bimester,answer_format,questions) values ($1,$2,$3,'mensal','História','Prova mensal',2026,4,'ABCDE',$4) returning id",[schoolA,classA,teacherA,JSON.stringify(base.questions)]);
    await db.query('update public.class_exams set finalized_at=now() where id=$1',[monthly.rows[0].id]);
    await assert.rejects(db.query("update public.class_exams set title='Título alterado' where id=$1",[monthly.rows[0].id]),/finalizada não pode ser alterada/);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::integer as n from public.class_exams')).rows[0].n,2);
    await db.exec('reset role');
    await assert.rejects(db.query('insert into public.class_exams (school_id,class_id,created_by,exam_type,subject,title,academic_year,bimester,answer_format,questions) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[schoolA,classB,teacherA,'bimestral',base.subject,base.title,2026,4,'ABCDE',JSON.stringify(base.questions)]),/turma ativa desta escola/);
    await assert.rejects(db.query('update public.class_exams set class_id=$1 where id=$2',[classB,id]),/não podem ser transferidas/);
    await assert.rejects(db.query('update public.class_exams set questions=$1 where id=$2',[JSON.stringify([{statement:'Pergunta válida',correct_answer:'Z'}]),id]),/Gabarito incompatível/);
    const models = await db.query("select model,sum((entry->>'count')::integer)::integer as n from (values ('caderno_1'),('caderno_2'),('simuladao')) m(model), lateral jsonb_array_elements(public.class_enem_plan(model)) entry group by model order by model");
    assert.deepEqual(models.rows.map(row => [row.model,row.n]),[['caderno_1',45],['caderno_2',45],['simuladao',90]]);
    const browser = {window:{}};
    vm.runInNewContext(readFileSync(path.join(__dirname,'..','cepi-blocks.js'),'utf8'),browser);
    for (const model of ['caderno_1','caderno_2','simuladao']) {
      const serverPlan = (await db.query('select public.class_enem_plan($1) as plan',[model])).rows[0].plan;
      assert.deepEqual(serverPlan,JSON.parse(JSON.stringify(browser.window.CepiBlocks.enemPlan(model))),`plano ${model} igual no Meu CP e na turma`);
    }
    const enem = await db.query('insert into public.class_exams (school_id,class_id,created_by,exam_type,enem_model,subject,title,academic_year,bimester,answer_format) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id',[schoolA,classA,teacherA,'enem','caderno_1','Simulado do ENEM','SIMULA - ENEM - CADERNO 1 - 4º BIM',2026,4,'ABCDE']);
    const enemId = enem.rows[0].id;
    const first = {statement:'Qual é a substância correta?',subject:'Química',alternatives:{A:'Primeira',B:'Segunda',C:'Terceira',D:'Quarta',E:'Quinta'},correct_answer:'C'};
    await db.query('update public.class_exams set questions=$1 where id=$2',[JSON.stringify([first]),enemId]);
    await assert.rejects(db.query('update public.class_exams set questions=$1 where id=$2',[JSON.stringify([{...first,subject:'Matemática'}]),enemId]),/disciplina da questão 1/);
    await assert.rejects(db.query('update public.class_exams set questions=$1 where id=$2',[JSON.stringify([{...first,alternatives:{A:'Uma'}}]),enemId]),/Complete as alternativas/);
    await assert.rejects(db.query('update public.class_exams set questions=$1 where id=$2',[JSON.stringify([{...first,alternatives:undefined}]),enemId]),/Complete as alternativas/);
    await assert.rejects(db.query('update public.class_exams set questions=$1 where id=$2',[JSON.stringify([{...first,correct_answer:''}]),enemId]),/Complete as alternativas/);
    await assert.rejects(db.query('update public.class_exams set title=$1 where id=$2',['Título livre',enemId]),/título não corresponde/);
    await as(teacherB);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select count(*)::integer as n from public.class_exams')).rows[0].n,0,'outro professor não lê a prova');
    await db.exec('reset role');
    assert.equal((await db.query('select public.can_view_class_exam($1,$2) as allowed',[schoolA,teacherA])).rows[0].allowed,false);
    await as(coordinator);
    assert.equal((await db.query('select public.can_manage_class_exam_header($1) as allowed',[schoolA])).rows[0].allowed,true);
    await db.query("insert into public.class_exam_headers(school_id,school_name,subtitle,updated_by) values ($1,'Escola Exemplo','Faça a prova com atenção.',$2)",[schoolA,coordinator]);
    await as(teacherB);
    assert.equal((await db.query('select public.can_manage_class_exam_header($1) as allowed',[schoolA])).rows[0].allowed,false);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select school_name from public.class_exam_headers where school_id=$1',[schoolA])).rows[0].school_name,'Escola Exemplo');
    assert.equal((await db.query("update public.class_exam_headers set subtitle='Indevido',updated_by=$1 where school_id=$2",[teacherB,schoolA])).affectedRows,0,'professor não altera cabeçalho geral');
    await db.exec('reset role');
    await as(coordinator);
    assert.equal((await db.query('select public.can_view_class_exam($1,$2) as allowed',[schoolA,teacherA])).rows[0].allowed,true);
    assert.equal((await db.query('select public.can_view_class_exam($1,$2) as allowed',[schoolB,teacherA])).rows[0].allowed,false);
    await db.query('update public.school_members set status=$1 where user_id=$2',['suspended',teacherA]);
    await as(teacherA);
    assert.equal((await db.query('select public.can_create_class_exam($1) as allowed',[schoolA])).rows[0].allowed,false);
  } finally { await db.close(); }
});
