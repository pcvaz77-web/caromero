const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {PGlite} = require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('secretaria recebe as cinco áreas por padrão e o administrador revoga só o vínculo escolhido', async () => {
  const db = new PGlite();
  const school = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const admin = '33333333-3333-4333-8333-333333333333';
  const secretary = '44444444-4444-4444-8444-444444444444';
  const member = '55555555-5555-4555-8555-555555555555';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.user_id',true),'')::uuid $$;
      create table public.schools(id uuid primary key,status text);
      create table public.school_members(id uuid primary key,school_id uuid,user_id uuid,status text,role text);
      create table public.school_member_permissions(member_id uuid primary key,can_manage_family_portal boolean,updated_at timestamptz);
      create table public.student_occurrences(id uuid,school_id uuid);
    `);
    const migration = readFileSync(path.join(__dirname,'..','supabase/migrations/229_secretary_family_portal_permissions.sql'),'utf8');
    await db.exec(migration.slice(0,migration.indexOf('-- Existing RPCs')) + 'commit;');
    await db.query('insert into public.schools values($1,$3),($2,$3)',[school,other,'active']);
    await db.query('insert into public.school_members values($1,$2,$3,$4,$5),($6,$2,$7,$4,$8)',
      ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',school,admin,'active','school_admin',member,secretary,'secretary']);
    const as = user => db.query('select set_config($1,$2,false)',['app.user_id',user]);
    const allowed = action => db.query('select public.family_can_school_action($1,$2) as allowed',[school,action]).then(result => result.rows[0].allowed);
    await as(secretary);
    for (const action of ['invite','add_child','occurrences','entries','cards','portal']) assert.equal(await allowed(action),true);
    await as(admin);
    await db.query('select public.set_family_secretary_permission($1,$2,$3)',[member,'can_family_entries',false]);
    await as(secretary);
    assert.equal(await allowed('entries'),false);
    assert.equal(await allowed('invite'),true);
    assert.equal(await allowed('portal'),true);
    assert.equal((await db.query('select public.family_can_school_action($1,$2) as allowed',[other,'invite'])).rows[0].allowed,false);
    await assert.rejects(db.query('select public.set_family_secretary_permission($1,$2,$3)',[member,'can_family_cards',false]),/Somente o administrador/);
    await as(admin);
    await db.query('select public.set_family_secretary_permission($1,$2,$3)',[member,'can_family_entries',true]);
    await as(secretary);
    assert.equal(await allowed('entries'),true);
  } finally { await db.close(); }
});

test('migração troca as guardas das RPCs sem alterar as outras validações', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.user_id',true),'')::uuid $$;
      create table public.schools(id uuid primary key,status text);
      create table public.school_members(id uuid primary key,school_id uuid,user_id uuid,status text,role text);
      create table public.school_member_permissions(member_id uuid primary key,can_manage_family_portal boolean,updated_at timestamptz);
      create table public.student_occurrences(id uuid,school_id uuid);
      create function public.family_school_manager(p_school_id uuid) returns boolean language sql as $$select false$$;
    `);
    const migration = readFileSync(path.join(__dirname,'..','supabase/migrations/229_secretary_family_portal_permissions.sql'),'utf8');
    const mapping = migration.match(/for v_item in select \* from \(values([\s\S]*?)\) as mapped/)?.[1];
    assert.ok(mapping);
    const names = [...mapping.matchAll(/\('([a-z_]+)','[a-z_]+'\)/g)].map(match => match[1]);
    assert.ok(names.length > 20);
    for (const name of names) {
      await db.exec(`create function public.${name}(p_school_id uuid) returns boolean
        language sql as $$select public.family_school_manager(p_school_id)$$;`);
    }
    await db.exec(`create function public.family_entry_attendance_publish(
      p_school_id uuid,p_class_id uuid,p_from date,p_to date)
      returns boolean language plpgsql as $$
      declare v_role text;
      begin
        select role into v_role from public.school_members
          where school_id=p_school_id and user_id=auth.uid();
        return v_role in ('school_admin','coordinator');
      end $$;`);
    await db.exec(migration);
    const school = '11111111-1111-4111-8111-111111111111';
    const person = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into public.schools values($1,$2)',[school,'active']);
    await db.query('insert into public.school_members values($1,$2,$3,$4,$5)',
      ['33333333-3333-4333-8333-333333333333',school,person,'active','secretary']);
    await db.query('select set_config($1,$2,false)',['app.user_id',person]);
    const call = name => db.query(`select public.${name}($1) as allowed`,[school]).then(result => result.rows[0].allowed);
    assert.equal(await call('family_issue_card'),true);
    assert.equal(await call('family_publish_occurrence'),true);
    assert.equal((await db.query('select public.family_entry_attendance_publish($1,$2,$3,$4) as allowed',
      [school,school,'2026-11-01','2026-11-05'])).rows[0].allowed,true);
    await db.query('insert into public.school_member_permissions(member_id,can_family_cards,can_family_occurrences) values($1,false,false)',
      ['33333333-3333-4333-8333-333333333333']);
    assert.equal(await call('family_issue_card'),false);
    assert.equal(await call('family_publish_occurrence'),false);
    assert.equal(await call('family_record_entry'),true);
  } finally { await db.close(); }
});
