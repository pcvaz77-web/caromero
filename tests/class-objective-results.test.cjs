const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {PGlite}=require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('cartões objetivos da turma são corrigidos no banco e respostas escritas continuam fora da leitura',async()=>{
  const db=new PGlite();
  const school='11111111-1111-4111-8111-111111111111';
  const cls='22222222-2222-4222-8222-222222222222';
  const student='33333333-3333-4333-8333-333333333333';
  const teacher='44444444-4444-4444-8444-444444444444';
  try{
    await db.exec(`
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select current_setting('app.user_id')::uuid$$;
      create table public.class_exams(id uuid primary key,school_id uuid,class_id uuid,exam_type text,answer_format text,questions jsonb,finalized_at timestamptz,deleted_at timestamptz);
      create table public.classes(id uuid primary key,school_id uuid,archived_at timestamptz,name text);
      create table public.students(id uuid primary key,school_id uuid,class_id uuid,enrollment_status text);
      create table public.class_exam_results(exam_id uuid,school_id uuid,student_id uuid,reviewed_by uuid,answers text[],correct_count integer,reviewed_at timestamptz);
      create function public.cepi_school_enabled(uuid) returns boolean language sql stable as $$select false$$;
    `);
    await db.exec(readFileSync(path.join(__dirname,'..','supabase/migrations/217_class_objective_exam_results.sql'),'utf8'));
    await db.exec('create trigger class_exam_result_guard before insert on public.class_exam_results for each row execute function public.validate_class_exam_result()');
    await db.query('select set_config($1,$2,false)',['app.user_id',teacher]);
    await db.query('insert into public.classes values ($1,$2,null,$3)',[cls,school,'1A']);
    await db.query('insert into public.students values ($1,$2,$3,$4)',[student,school,cls,'active']);
    const exam='55555555-5555-4555-8555-555555555555';
    await db.query('insert into public.class_exams values ($1,$2,$3,$4,$5,$6,now(),null)',[exam,school,cls,'bimestral','ABCD',JSON.stringify([{correct_answer:'A'},{correct_answer:'C'}])]);
    const saved=await db.query('insert into public.class_exam_results(exam_id,school_id,student_id,reviewed_by,answers) values ($1,$2,$3,$4,$5) returning correct_count',[exam,school,student,teacher,['A','-']]);
    assert.equal(saved.rows[0].correct_count,1);
    await assert.rejects(db.query('insert into public.class_exam_results(exam_id,school_id,student_id,reviewed_by,answers) values ($1,$2,$3,$4,$5)',[exam,school,student,teacher,['AB','C']]),/respostas não correspondem/);
    await db.query('update public.class_exams set answer_format=$1,questions=$2 where id=$3',['LIVRE',JSON.stringify([{model_answer:'Texto'}]),exam]);
    await assert.rejects(db.query('insert into public.class_exam_results(exam_id,school_id,student_id,reviewed_by,answers) values ($1,$2,$3,$4,$5)',[exam,school,student,teacher,['A']]),/prova objetiva/);
  }finally{await db.close();}
});
