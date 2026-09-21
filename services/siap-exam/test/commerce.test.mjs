import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {examBlockKey} from '../../../supabase/functions/generate-siap-ai-draft/exam-block.mjs';
test('bloco ignora turma e disciplina, mas separa ano, bimestre e ciclo',()=>{
 const b={year:2026,term:3,assessment:'Ciclo1 - Bloco LGG'};
 assert.equal(examBlockKey(b),examBlockKey({...b,assessment:'Ciclo 1 - LGG',classroom:'1E',subject:'Arte'}));
 for(const extra of [{year:2027},{term:4},{assessment:'Ciclo2 - LGG'},{assessment:'Ciclo1 - MAT'}]) assert.notEqual(examBlockKey(b),examBlockKey({...b,...extra}));
 assert.throws(()=>examBlockKey({...b,assessment:'Prova desconhecida'}));
});
test('SQL: pagamento idempotente, QR reserva após leitura, turmas reutilizam, finalização, plano e reembolso isolados',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
 create function auth.uid() returns uuid language sql as $$select current_setting('test.uid',true)::uuid$$;
 create table siap_assistant_plans(plan_key text primary key,display_name text,amount numeric,billing_months integer);
 insert into siap_assistant_plans values('monthly','Mensal',79.90,1),('quarterly','Trimestral',129.90,3),('semiannual','Semestral',129.90,6);
 create table siap_exam_access_grants(user_id uuid,expires_at timestamptz,revoked_at timestamptz);
 create function get_siap_assistant_access_status() returns jsonb language sql as $$select '{"active":false,"mode":"external","status":"free"}'::jsonb$$;
 create function get_siap_assistant_button_visibility() returns jsonb language sql as $$select '{"visible":false}'::jsonb$$;
 insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
 set test.role='service_role';set test.uid='00000000-0000-4000-8000-000000000001';`);
 await db.exec(readFileSync(new URL('../../../supabase/migrations/141_siap_exam_commerce.sql',import.meta.url),'utf8'));
 const user='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const access=async(block=null,operation='status',who=user)=>(await db.query('select siap_exam_commerce_access($1,$2,$3) a',[who,block,operation])).rows[0].a;
 const order=async(key)=>(await db.query(`insert into siap_exam_orders(user_id,offer_key,payer_email,legal_accepted_at,amount,credits,months,product_id,offer_code) select $1,offer_key,'fake@example.invalid',now(),amount,credits,months,123,'fake' from siap_exam_offers where offer_key=$2 returning id`,[user,key])).rows[0].id;
 const event=async(id,tx,amount,kind='approved')=>db.query('select siap_exam_payment_event($1,$2,$3,$4,now())',[id,tx,amount,kind]);
 const id=await order('exam_one');await event(id,'tx1',20);await event(id,'tx1',20);
 assert.equal((await access()).credits,1);assert.equal((await access(null,'status',other)).active,false);
 assert.equal((await access('2026:3:CICLO1LGG','preview')).active,true);assert.equal((await access()).credits,1);
 assert.equal((await access('2026:3:CICLO1LGG','bind')).active,true);assert.equal((await access()).credits,0);
 assert.equal((await access('2026:3:CICLO1LGG','bind')).active,true);
 assert.equal((await access('2026:3:CICLO1MAT','bind')).active,false);
 await access('2026:3:CICLO1LGG','finish');assert.equal((await access('2026:3:CICLO1LGG','bind')).active,false);
 const four=await order('exam_four');await event(four,'tx4',80);assert.equal((await access()).credits,4);
 await event(four,'tx4',80,'revoked');assert.equal((await access()).credits,0);await event(four,'tx4',80);assert.equal((await access()).credits,0);
 const bundle=await order('monthly_exam');await assert.rejects(event(bundle,'bad',35),/divergente/);
 await event(bundle,'bundle',114.90);assert.equal((await access()).status,'subscription');
 assert.equal((await access('2026:3:CICLO1MAT','bind')).active,true);assert.equal((await access()).credits,0);
 assert.equal((await db.query('select get_siap_assistant_access_status() a')).rows[0].a.mode,'subscription');
 await db.query('insert into siap_exam_access_grants values($1,null,null)',[user]);
 await event(bundle,'bundle',114.90,'revoked');assert.equal((await access()).status,'granted');
 assert.equal((await db.query('select get_siap_assistant_access_status() a')).rows[0].a.mode,'external');
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from siap_exam_credits'),/permission denied/);
 await assert.rejects(access('2026:3:CICLO1MAT','bind'),/permission denied/);
 } finally {await db.close();}
});
