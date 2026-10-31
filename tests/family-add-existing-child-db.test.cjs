const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('secretaria acrescenta filho a conta ativa sem novo convite e sem ampliar a gestão', async () => {
  const db=new PGlite();
  const school='11111111-1111-4111-8111-111111111111';
  const otherSchool='11111111-1111-4111-8111-111111111112';
  const guardianUser='22222222-2222-4222-8222-222222222222';
  const secretary='33333333-3333-4333-8333-333333333333';
  const coordinator='44444444-4444-4444-8444-444444444444';
  const outsider='55555555-5555-4555-8555-555555555555';
  const guardian='66666666-6666-4666-8666-666666666666';
  const classId='77777777-7777-4777-8777-777777777777';
  const first='88888888-8888-4888-8888-888888888888';
  const third='99999999-9999-4999-8999-999999999999';
  const otherStudent='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const message='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.user_id',true),'')::uuid $$;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_app_meta_data jsonb);
      create table public.schools(id uuid primary key,status text);
      create table public.school_members(id uuid primary key,school_id uuid,user_id uuid,status text,role text);
      create table public.school_member_permissions(member_id uuid primary key,can_manage_family_portal boolean);
      create table public.classes(id uuid primary key,school_id uuid,name text,archived_at timestamptz);
      create table public.students(id uuid primary key,school_id uuid,class_id uuid,full_name text,enrollment_status text,
        guardian_name text,guardian_phone text,show_guardian_on_card boolean not null default false);
      create table public.family_cpf_guardians(id uuid primary key,school_id uuid,cpf text,
        guardian_name text,guardian_user_id uuid,removed_at timestamptz,phone_local text);
      create table public.family_cpf_children(guardian_id uuid,school_id uuid,student_id uuid,
        status text not null default 'active',revoked_at timestamptz,primary key(guardian_id,student_id));
      create table public.family_links(id uuid primary key default gen_random_uuid(),school_id uuid,
        student_id uuid,student_name text,guardian_name text,phone_e164 text,guardian_user_id uuid,
        status text,invitation_token uuid,accepted_at timestamptz,invitation_expires_at timestamptz);
      create table public.family_messages(id uuid primary key,school_id uuid,student_id uuid,status text);
      create table public.family_receipts(message_id uuid,link_id uuid,primary key(message_id,link_id));
      create table public.family_audit(school_id uuid,actor_id uuid,action text,subject_id uuid);
      create function public.family_cpf_valid(p_cpf text) returns boolean language sql immutable as $$
        select p_cpf='52998224725' $$;
      create function public.family_cpf_name_key(p_name text) returns text language sql immutable as $$
        select lower(btrim(p_name)) $$;
      create function public.family_school_manager(p_school_id uuid) returns boolean language sql stable as $$
        select false $$;
      create function public.can_edit_student_guardian_contact(p_school_id uuid) returns boolean language sql stable as $$
        select false $$;
    `);
    await db.query('insert into public.schools values($1,$2),($3,$2)',[school,'active',otherSchool]);
    await db.query('insert into public.classes values($1,$2,$3,null)',[classId,school,'6A']);
    await db.query('insert into public.students(id,school_id,class_id,full_name,enrollment_status) values($1,$2,$3,$4,$5),($6,$2,$3,$7,$5),($8,$9,$3,$10,$5)',
      [first,school,classId,'Primeiro filho','active',third,'Terceiro filho',otherStudent,otherSchool,'Outra escola']);
    await db.query('insert into auth.users values($1,now(),$2)',[guardianUser,{family_portal:'true'}]);
    await db.query('insert into public.school_members values($1,$2,$3,$4,$5),($6,$2,$7,$4,$8)',
      ['cccccccc-cccc-4ccc-8ccc-cccccccccccc',school,secretary,'active','secretary',
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',coordinator,'coordinator']);
    await db.query('insert into public.school_member_permissions values($1,false)',
      ['dddddddd-dddd-4ddd-8ddd-dddddddddddd']);
    await db.query('insert into public.family_cpf_guardians(id,school_id,cpf,guardian_name,guardian_user_id,removed_at,phone_local) values($1,$2,$3,$4,$5,null,$6)',
      [guardian,school,'52998224725','Responsável',guardianUser,'62999999999']);
    await db.query('insert into public.family_cpf_children values($1,$2,$3,$4,null)',
      [guardian,school,first,'active']);
    await db.query('insert into public.family_links(school_id,student_id,student_name,guardian_name,guardian_user_id,status) values($1,$2,$3,$4,$5,$6)',
      [school,first,'Primeiro filho','Responsável',guardianUser,'active']);
    await db.query('insert into public.family_messages values($1,$2,$3,$4)',[message,school,third,'published']);
    await db.exec(readFileSync(path.join(__dirname,'..','supabase/migrations/207_family_add_child_to_existing_account.sql'),'utf8'));
    await db.exec(`create trigger contact_guard before update of guardian_name,guardian_phone,show_guardian_on_card
      on public.students for each row execute function public.enforce_student_guardian_contact_permission()`);
    const as=user=>db.query('select set_config($1,$2,false)',['app.user_id',user]);
    await as(secretary);
    assert.equal((await db.query('select public.family_can_add_existing_child($1) as allowed',[school])).rows[0].allowed,true);
    const found=await db.query('select * from public.family_cpf_existing_account($1,$2)',[school,'52998224725']);
    assert.equal(found.rows[0].guardian_id,guardian);
    assert.equal(found.rows[0].student_id,first);
    const result=await db.query('select public.family_cpf_add_child_to_active($1,$2,$3) as link_id',[school,guardian,third]);
    assert.ok(result.rows[0].link_id);
    assert.equal((await db.query('select count(*)::int as total from public.family_links where guardian_user_id=$1 and status=$2',
      [guardianUser,'active'])).rows[0].total,2);
    assert.equal((await db.query('select count(*)::int as total from public.family_receipts where link_id=$1',
      [result.rows[0].link_id])).rows[0].total,1);
    assert.equal((await db.query('select count(*)::int as total from public.family_cpf_children where guardian_id=$1 and status=$2',
      [guardian,'active'])).rows[0].total,2);
    const studentContact=(await db.query('select guardian_name,guardian_phone from public.students where id=$1',[third])).rows[0];
    assert.deepEqual(studentContact,{guardian_name:'Responsável',guardian_phone:'62999999999'});
    await assert.rejects(db.query('select public.family_cpf_add_child_to_active($1,$2,$3)',[school,guardian,third]),/já está vinculado/);
    await assert.rejects(db.query('select public.family_cpf_add_child_to_active($1,$2,$3)',[school,guardian,otherStudent]),/Aluno ativo não encontrado/);
    await as(coordinator);
    assert.equal((await db.query('select public.family_can_add_existing_child($1) as allowed',[school])).rows[0].allowed,false);
    await as(outsider);
    await assert.rejects(db.query('select * from public.family_cpf_existing_account($1,$2)',[school,'52998224725']),/Sem permissão/);
    await assert.rejects(db.query('select public.family_cpf_add_child_to_active($1,$2,$3)',[school,guardian,third]),/Sem permissão/);
  } finally { await db.close(); }
});
