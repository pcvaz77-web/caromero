const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,'supabase/migrations',f),'utf8');
const modulePath=process.env.CAROMETRO_PGLITE_MODULE;
test('exclusao preserva frequencias e nome historico; nova conta nao herda autoria', {skip:!modulePath},async()=>{
 const {PGlite}=require(modulePath);const db=new PGlite();
 try {
 await db.exec(`create schema auth; create role anon; create role authenticated;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table public.schools(id uuid primary key);create table public.students(id uuid primary key);create table public.classes(id uuid primary key);
 create table public.profiles(id uuid primary key references auth.users on delete cascade,full_name text,email text);
 create function public.is_active_school_member(uuid) returns boolean language sql as $$select $1='00000000-0000-0000-0000-000000000010'::uuid$$;`);
 for(const [file,table] of [['105_assisted_attendance_status.sql','siap_attendance_history'],['105_assisted_attendance_status.sql','siap_attendance_current'],['106_siap_attendance_status_events.sql','siap_attendance_status_events']]){
 const source=read(file);const start=source.indexOf('create table if not exists public.'+table);await db.exec(source.slice(start,source.indexOf('\n);',start)+4));
 }
 await db.exec(`alter table siap_attendance_current add source_dates text[] default '{}';
 create table siap_school_daily_attendance_current (like siap_attendance_current);
 create table school_siap_attendance_settings(school_id uuid,frequent_minimum integer,absent_minimum integer);`);
 const previous=read('135_attendance_partial_period_labels.sql');
 const start=previous.indexOf('create or replace function public.sync_siap_attendance_current_source_dates');
 await db.exec(previous.slice(start,previous.indexOf('update public.siap_attendance_current current_row',start)));
 await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001');
 insert into profiles values ('00000000-0000-0000-0000-000000000001','Prof. Paulo','synthetic@example.test');
 insert into schools values ('00000000-0000-0000-0000-000000000010');
 insert into students values ('00000000-0000-0000-0000-000000000020');
 insert into siap_attendance_history(school_id,student_id,academic_year,term,subject,months,lesson_count,presences,absences,percentage,status,period_key,source_dates,imported_by)
 values ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',2026,'3','Matematica',array['Setembro'],3,1,2,33,'active_search','setembro',array['2026-09-21'],'00000000-0000-0000-0000-000000000001');
 insert into siap_attendance_current(school_id,student_id,academic_year,term,subject,months,lesson_count,presences,absences,percentage,status,period_key,updated_by)
 select school_id,student_id,academic_year,term,subject,months,lesson_count,presences,absences,percentage,status,period_key,imported_by from siap_attendance_history;
 insert into siap_attendance_status_events(school_id,student_id,academic_year,term,subject,months,to_status,percentage,changed_by)
 select school_id,student_id,academic_year,term,subject,months,status,percentage,updated_by from siap_attendance_current;`);
 const tables=[['siap_attendance_history','imported_by'],['siap_attendance_current','updated_by'],['siap_attendance_status_events','changed_by']];
 const before=await Promise.all(tables.map(async([table,column])=>(await db.query(`select to_jsonb(a)-'${column}' as data from ${table} a`)).rows));
 await db.exec(read('143_attendance_auth_user_deletion.sql'));
 let labels=await db.query("select * from get_effective_siap_attendance_labels_v2('00000000-0000-0000-0000-000000000010')");assert.equal(labels.rows[0].teacher_name,'Prof. Paulo');
 await db.exec("delete from auth.users where id='00000000-0000-0000-0000-000000000001'");
 for(let i=0;i<tables.length;i++){const [table,column]=tables[i];const result=await db.query(`select to_jsonb(a)-'${column}'-'actor_name' as data,${column} as author,actor_name from ${table} a`);assert.deepEqual(result.rows.map(r=>({data:r.data})),before[i]);assert.equal(result.rows[0].author,null);assert.equal(result.rows[0].actor_name,'Prof. Paulo');}
 labels=await db.query("select * from get_effective_siap_attendance_labels_v2('00000000-0000-0000-0000-000000000010')");assert.equal(labels.rows[0].teacher_name,'Prof. Paulo (excluído do Carômetro)');assert.equal(labels.rows[0].percentage,33);assert.deepEqual(labels.rows[0].source_dates,['2026-09-21']);
 await assert.rejects(db.query("select * from get_effective_siap_attendance_labels_v2('00000000-0000-0000-0000-000000000099')"),/Acesso restrito/);
 await db.exec("insert into auth.users values('00000000-0000-0000-0000-000000000002'); insert into profiles values('00000000-0000-0000-0000-000000000002','Paulo Novo','synthetic@example.test')");
 labels=await db.query("select * from get_effective_siap_attendance_labels_v2('00000000-0000-0000-0000-000000000010')");assert.equal(labels.rows[0].teacher_name,'Prof. Paulo (excluído do Carômetro)');
 } finally {await db.close();}
});
