const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('carteirinha usa o contato do responsável do próprio vínculo', async () => {
  const db = new PGlite();
  const school='11111111-1111-4111-8111-111111111111';
  const student='22222222-2222-4222-8222-222222222222';
  const classId='33333333-3333-4333-8333-333333333333';
  const guardian='44444444-4444-4444-8444-444444444444';
  const otherGuardian='55555555-5555-4555-8555-555555555555';
  const link='66666666-6666-4666-8666-666666666666';
  const otherLink='77777777-7777-4777-8777-777777777777';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.user_id',true),'')::uuid $$;
      create table public.schools(id uuid primary key,name text,status text);
      create table public.classes(id uuid primary key,school_id uuid,name text,archived_at timestamptz);
      create table public.students(id uuid primary key,school_id uuid,class_id uuid,full_name text,
        photo_path text,guardian_name text,guardian_phone text,enrollment_status text);
      create table public.family_links(id uuid primary key,school_id uuid,student_id uuid,
        guardian_user_id uuid,guardian_name text,phone_e164 text,status text);
      create table public.family_digital_card_settings(school_id uuid primary key,enabled boolean);
      create table public.family_student_cards(id uuid primary key default gen_random_uuid(),
        qr_token uuid default gen_random_uuid(),school_id uuid,student_id uuid,
        issued_by uuid,revoked_at timestamptz);
      create table public.family_cpf_guardians(id uuid primary key,school_id uuid,
        guardian_user_id uuid,guardian_name text,phone_local text,created_at timestamptz,removed_at timestamptz);
      create table public.family_cpf_children(guardian_id uuid,school_id uuid,student_id uuid,status text);
      create function public.family_cpf_name_key(p_name text) returns text language sql immutable as $$
        select lower(btrim(coalesce(p_name,''))) $$;
      create function public.family_my_students()
      returns table(link_id uuid,school_id uuid,student_id uuid) language sql stable as $$
        select l.id,l.school_id,l.student_id from public.family_links l
        where l.guardian_user_id=auth.uid() and l.status='active' $$;
    `);
    await db.query('insert into public.schools values($1,$2,$3)',[school,'Escola','active']);
    await db.query('insert into public.classes values($1,$2,$3,null)',[classId,school,'6A']);
    await db.query('insert into public.students values($1,$2,$3,$4,null,$5,$6,$7)',
      [student,school,classId,'Aluno','Responsável','62988888888','active']);
    await db.query('insert into public.family_digital_card_settings values($1,true)',[school]);
    await db.query('insert into public.family_links values($1,$2,$3,$4,$5,null,$6)',
      [link,school,student,guardian,'Responsável','active']);
    await db.query('insert into public.family_links values($1,$2,$3,$4,$5,null,$6)',
      [otherLink,school,student,otherGuardian,'Outro responsável','active']);
    await db.query('insert into public.family_cpf_guardians values($1,$2,$3,$4,$5,now(),null)',
      ['88888888-8888-4888-8888-888888888888',school,guardian,'Responsável','62999999999']);
    await db.query('insert into public.family_cpf_children values($1,$2,$3,$4)',
      ['88888888-8888-4888-8888-888888888888',school,student,'active']);
    await db.exec(readFileSync(path.join(__dirname,'..','supabase/migrations/206_family_digital_card_guardian_contact.sql'),'utf8'));
    const as=user=>db.query('select set_config($1,$2,false)',['app.user_id',user]);
    await as(guardian);
    const card=()=>db.query('select guardian_phone from public.family_get_digital_card($1)',[link]);
    assert.equal((await card()).rows[0].guardian_phone,'62999999999');
    await db.query('update public.family_links set phone_e164=$1 where id=$2',['+5562997777777',link]);
    assert.equal((await card()).rows[0].guardian_phone,'+5562997777777');
    await db.query('update public.family_links set phone_e164=null where id=$1',[link]);
    await db.query('update public.family_cpf_guardians set phone_local=null where guardian_user_id=$1',[guardian]);
    assert.equal((await card()).rows[0].guardian_phone,'62988888888');
    await as(otherGuardian);
    assert.equal((await db.query('select guardian_phone from public.family_get_digital_card($1)',[otherLink])).rows[0].guardian_phone,null);
    await assert.rejects(card(),/Carteirinha digital não liberada/);
  } finally { await db.close(); }
});
