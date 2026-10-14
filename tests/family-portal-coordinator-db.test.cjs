const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {PGlite} = require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('administração revoga e restaura o portal por coordenador e escola', async () => {
  const db = new PGlite();
  const schoolA='11111111-1111-4111-8111-111111111111';
  const schoolB='11111111-1111-4111-8111-111111111112';
  const adminA='22222222-2222-4222-8222-222222222222';
  const adminB='22222222-2222-4222-8222-222222222223';
  const coordinator='33333333-3333-4333-8333-333333333333';
  const coordinatorB='33333333-3333-4333-8333-333333333334';
  const teacher='44444444-4444-4444-8444-444444444444';
  const coordinatorMember='55555555-5555-4555-8555-555555555555';
  const teacherMember='55555555-5555-4555-8555-555555555556';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select current_setting('app.user_id')::uuid
      $$;
      create table public.schools(id uuid primary key,status text not null);
      create table public.school_members(id uuid primary key,school_id uuid not null,user_id uuid not null,role text not null,status text not null);
      create table public.school_member_permissions(member_id uuid primary key references public.school_members(id),updated_at timestamptz default now());
      insert into public.schools values ('${schoolA}','active'),('${schoolB}','active');
      insert into public.school_members values
        ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${schoolA}','${adminA}','school_admin','active'),
        ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${schoolB}','${adminB}','school_admin','active'),
        ('${coordinatorMember}','${schoolA}','${coordinator}','coordinator','active'),
        ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${schoolB}','${coordinatorB}','coordinator','active'),
        ('${teacherMember}','${schoolA}','${teacher}','teacher','active');
    `);
    const sql=readFileSync(path.join(__dirname,'..','supabase/migrations/180_family_portal_coordinator_permission.sql'),'utf8');
    await db.exec(sql);
    const as = async user => db.query('select set_config($1,$2,false)', ['app.user_id',user]);
    const canManage = async school => (await db.query('select public.family_school_manager($1) as allowed',[school])).rows[0].allowed;
    const setPermission = async (member,permitted) => db.query('select public.set_family_portal_permission($1,$2)',[member,permitted]);

    await as(coordinator);
    assert.equal(await canManage(schoolA),true,'coordenador existente começa autorizado sem atualizar linhas');
    assert.equal(await canManage(schoolB),false,'permissão não atravessa escolas');
    await as(teacher);
    assert.equal(await canManage(schoolA),false,'professor não recebe acesso');
    await assert.rejects(setPermission(coordinatorMember,false),/Somente a administração/);
    await as(adminB);
    await assert.rejects(setPermission(coordinatorMember,false),/Somente a administração/);
    await as(adminA);
    assert.equal(await canManage(schoolA),true);
    await assert.rejects(setPermission(teacherMember,true),/Coordenador ativo não encontrado/);
    await setPermission(coordinatorMember,false);
    await as(coordinator);
    assert.equal(await canManage(schoolA),false,'a revogação impede as RPCs do portal');
    await assert.rejects(setPermission(coordinatorMember,true),/Somente a administração/);
    await as(coordinatorB);
    assert.equal(await canManage(schoolB),true,'outro coordenador conserva o acesso padrão');
    await as(adminA);
    await setPermission(coordinatorMember,true);
    await as(coordinator);
    assert.equal(await canManage(schoolA),true,'administração pode restaurar o acesso');
  } finally { await db.close(); }
});
