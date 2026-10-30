const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('cadastro por CPF respeita escola e revoga os vínculos de alunos transferidos', async () => {
  const db = new PGlite();
  const schoolA = '11111111-1111-4111-8111-111111111111';
  const schoolB = '11111111-1111-4111-8111-111111111112';
  const studentA = '22222222-2222-4222-8222-222222222221';
  const studentB = '22222222-2222-4222-8222-222222222222';
  const studentOther = '22222222-2222-4222-8222-222222222223';
  const adminA = '33333333-3333-4333-8333-333333333331';
  const adminB = '33333333-3333-4333-8333-333333333332';
  const familyUser = '44444444-4444-4444-8444-444444444444';
  const otherFamily = '44444444-4444-4444-8444-444444444445';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.user_id',true),'')::uuid
      $$;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb);
      create table public.schools(id uuid primary key,status text not null,name text);
      create table public.classes(id uuid primary key,school_id uuid,name text);
      create table public.students(id uuid primary key,school_id uuid not null,full_name text not null,
        class_id uuid,class_name text,enrollment_status text not null,
        guardian_name text,guardian_phone text,guardian_has_whatsapp boolean,show_guardian_on_card boolean);
      create table public.family_links(id uuid primary key default gen_random_uuid(),school_id uuid,student_id uuid,
        student_name text,guardian_name text,phone_e164 text,guardian_user_id uuid,status text,
        invitation_token uuid,accepted_at timestamptz,invitation_expires_at timestamptz,revoked_at timestamptz,
        removed_at timestamptz);
      create table public.family_messages(id uuid primary key,school_id uuid,student_id uuid,status text,
        title text,body text,category text,published_at timestamptz);
      create table public.family_receipts(message_id uuid,link_id uuid,viewed_at timestamptz,
        acknowledged_at timestamptz,primary key(message_id,link_id));
      create table public.family_audit(id bigint generated always as identity primary key,school_id uuid,actor_id uuid,
        action text,subject_id uuid);
      create table public.school_members(user_id uuid,school_id uuid);
      create table public.push_subscriptions(user_id uuid,endpoint text unique,p256dh text,auth_key text,
        user_agent text,enabled boolean,last_seen_at timestamptz);
      create function public.is_platform_owner() returns boolean language sql as $$select false$$;
      create function public.can_use_school(p_school uuid) returns boolean language sql as $$select false$$;
      create function public.family_school_manager(p_school_id uuid) returns boolean language sql stable as $$
        select (p_school_id='11111111-1111-4111-8111-111111111111' and auth.uid()='33333333-3333-4333-8333-333333333331')
          or (p_school_id='11111111-1111-4111-8111-111111111112' and auth.uid()='33333333-3333-4333-8333-333333333332')
      $$;
      create function public.can_edit_student_guardian_contact(p_school_id uuid) returns boolean language sql stable as $$select false$$;
      create function public.enforce_student_guardian_contact_permission() returns trigger language plpgsql as $$
      begin
        if old.guardian_name is distinct from new.guardian_name or old.guardian_phone is distinct from new.guardian_phone then
          raise exception 'Sem permissao para editar os dados do responsavel pelo aluno';
        end if;
        return new;
      end;
      $$;
      create trigger enforce_student_guardian_contact_permission before update on public.students
        for each row execute function public.enforce_student_guardian_contact_permission();
      insert into public.schools values
        ('11111111-1111-4111-8111-111111111111','active','Escola A'),
        ('11111111-1111-4111-8111-111111111112','active','Escola B');
      insert into public.students(id,school_id,full_name,class_id,class_name,enrollment_status,guardian_name,guardian_phone) values
        ('22222222-2222-4222-8222-222222222221','11111111-1111-4111-8111-111111111111','Ana',null,'1A','active',null,null),
        ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','Bia',null,'1A','active','Outra Pessoa','62988888888'),
        ('22222222-2222-4222-8222-222222222223','11111111-1111-4111-8111-111111111112','Caio',null,'1A','active',null,null);
      insert into auth.users values
        ('44444444-4444-4444-8444-444444444444','familia-5562999999999@sistemacarometro.com.br',now(),'{"family_portal":true}'),
        ('44444444-4444-4444-8444-444444444445','familia-cpf-other@sistemacarometro.com.br',now(),'{"family_portal":true}'),
        ('33333333-3333-4333-8333-333333333331','admin-a@example.test',now(),'{}'),
        ('33333333-3333-4333-8333-333333333332','admin-b@example.test',now(),'{}');
    `);
    const migration=readFileSync(path.join(__dirname,'..','supabase/migrations/203_family_cpf_self_registration.sql'),'utf8');
    try { await db.exec(migration); } catch (error) { throw new Error(error.message); }
    const contactMigration=readFileSync(path.join(__dirname,'..','supabase/migrations/204_family_cpf_individual_and_student_contact.sql'),'utf8');
    try { await db.exec(contactMigration); } catch (error) { throw new Error(error.message); }
    const as=user=>db.query('select set_config($1,$2,false)',['app.user_id',user]);
    await as(adminA);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.family_cpf_register_bundle(uuid,uuid[],text,text)','EXECUTE') as allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select has_function_privilege('authenticated','public.family_cpf_register_bundle_contact(uuid,uuid[],text,text,text)','EXECUTE') as allowed")).rows[0].allowed,true);
    assert.equal((await db.query('select public.family_cpf_valid($1) as value',['52998224725'])).rows[0].value,true);
    assert.equal((await db.query('select public.family_cpf_valid($1) as value',['11111111111'])).rows[0].value,false);
    for (let attempt=0;attempt<8;attempt++)
      assert.equal((await db.query('select public.family_cpf_limit($1) as value',['a'.repeat(64)])).rows[0].value,true);
    assert.equal((await db.query('select public.family_cpf_limit($1) as value',['a'.repeat(64)])).rows[0].value,false);
    const result=await db.query('select public.family_cpf_register_bundle($1,$2,$3,$4) as id',[
      schoolA,[studentA,studentB],'Maria da Silva','52998224725',
    ]);
    const guardianId=result.rows[0].id;
    await assert.rejects(db.query("update public.students set guardian_name='Pessoa sem cadastro',guardian_phone='62977777777' where id=$1",[studentA]),/Sem permissao/);
    const contact=await db.query('select * from public.family_cpf_register_bundle_contact($1,$2,$3,$4,$5)',[
      schoolA,[studentA,studentB],'Maria da Silva','52998224725','62999999999',
    ]);
    assert.equal(contact.rows[0].filled_count,1);
    assert.equal((await db.query('select guardian_name,guardian_phone from public.students where id=$1',[studentA])).rows[0].guardian_phone,'62999999999');
    assert.equal((await db.query('select guardian_name,guardian_phone from public.students where id=$1',[studentB])).rows[0].guardian_phone,'62988888888');
    await assert.rejects(db.query("update public.students set guardian_phone='62977777777' where id=$1",[studentA]),/Sem permissao/);
    await assert.rejects(db.query("update public.students set guardian_name='Maria da Silva',guardian_phone='62999999999' where id=$1",[studentB]),/Sem permissao/);
    await assert.rejects(db.query('select * from public.family_cpf_register_bundle_contact($1,$2,$3,$4,$5)',[
      schoolA,[studentA],'Maria da Silva','52998224725','5562999999999',
    ]),/DDD e número/);
    const invite=await db.query('select * from public.family_cpf_create_individual_invite($1,$2,$3,$4,$5)',[
      schoolA,[studentA,studentB],'Maria da Silva','52998224725','62999999999',
    ]);
    assert.ok(invite.rows[0].invitation_token);
    const expired=await db.query('select * from public.family_cpf_create_individual_invite($1,$2,$3,$4,$5)',[
      schoolA,[studentA],'Maria da Silva','52998224725','62999999999',
    ]);
    await db.query("update public.family_cpf_invites set expires_at=now()-interval '1 second' where token=$1",[
      expired.rows[0].invitation_token,
    ]);
    await assert.rejects(db.query('select public.family_cpf_redeem_invite($1,$2,$3)',[
      expired.rows[0].invitation_token,guardianId,familyUser,
    ]),/inválido ou vencido/);
    await assert.rejects(db.query('select public.family_cpf_register($1,$2,$3,$4)',[
      schoolA,studentOther,'Maria da Silva','52998224725',
    ]),/Aluno ativo não encontrado/);
    await as(adminB);
    await assert.rejects(db.query('select * from public.family_cpf_register_bundle_contact($1,$2,$3,$4,$5)',[
      schoolA,[studentA],'Maria da Silva','52998224725','62999999999',
    ]),/Sem permissão/);
    await assert.rejects(db.query('select public.family_cpf_remove_child($1,$2,$3)',[
      schoolA,guardianId,studentA,
    ]),/Sem permissão/);
    await db.query('select public.family_cpf_redeem_invite($1,$2,$3)',[
      invite.rows[0].invitation_token,guardianId,familyUser,
    ]);
    await assert.rejects(db.query('select public.family_cpf_redeem_invite($1,$2,$3)',[
      invite.rows[0].invitation_token,guardianId,familyUser,
    ]),/inválido ou vencido/);
    assert.equal((await db.query("select count(*)::int as count from public.family_links where status='active'")).rows[0].count,2);
    await assert.rejects(db.query('select public.family_cpf_claim($1,$2)',[guardianId,otherFamily]),/Cadastro indisponível/);
    await as(familyUser);
    assert.equal((await db.query('select * from public.family_my_students()')).rows.length,2);
    await as(adminA);
    await db.query('select public.family_cpf_remove_child($1,$2,$3)',[schoolA,guardianId,studentA]);
    assert.equal((await db.query('select status from public.family_links where student_id=$1',[studentA])).rows[0].status,'revoked');
    assert.equal((await db.query('select status from public.family_links where student_id=$1',[studentB])).rows[0].status,'active');
    await as(familyUser);
    assert.equal((await db.query('select * from public.family_my_students()')).rows.length,1);
    await as(adminA);
    await db.query('update public.students set enrollment_status=$1 where id=$2',['transferred',studentB]);
    assert.equal((await db.query('select status from public.family_links where student_id=$1',[studentB])).rows[0].status,'revoked');
    assert.equal((await db.query("select count(*)::int as count from public.family_cpf_children where status='active'")).rows[0].count,0);
    const found=await db.query('select * from public.family_cpf_find_guardian($1,$2)',[schoolA,'52998224725']);
    assert.equal(found.rows.length,2);
    assert.equal(found.rows.find(row=>row.student_id===studentB).enrollment_status,'transferred');
    await as(familyUser);
    assert.equal((await db.query('select * from public.family_my_students()')).rows.length,0);
    await as(adminA);
    await db.query('select public.family_cpf_remove_guardian($1,$2)',[schoolA,guardianId]);
    assert.equal((await db.query('select * from public.family_cpf_find_guardian($1,$2)',[schoolA,'52998224725'])).rows.length,0);
    const restored=await db.query('select public.family_cpf_register($1,$2,$3,$4) as id',[
      schoolA,studentA,'Maria da Silva','52998224725',
    ]);
    assert.equal(restored.rows[0].id,guardianId,'novo pré-cadastro reutiliza a identidade removida');
    assert.equal((await db.query('select guardian_user_id from public.family_cpf_guardians where id=$1',[
      guardianId,
    ])).rows[0].guardian_user_id,familyUser);
    await db.query('select public.family_cpf_remove_guardian($1,$2)',[schoolA,guardianId]);
    await db.query(`insert into public.family_links(school_id,student_id,student_name,guardian_name,phone_e164,
      guardian_user_id,status,accepted_at) values($1,$2,'Caio','Maria da Silva','+5562999999999',$3,'active',now())`,
      [schoolB,studentOther,familyUser]);
    await as(adminB);
    const existing=await db.query('select public.family_cpf_register($1,$2,$3,$4) as id',[
      schoolB,studentOther,'Maria da Silva','52998224725',
    ]);
    assert.equal((await db.query('select guardian_user_id from public.family_cpf_guardians where id=$1',[
      existing.rows[0].id,
    ])).rows[0].guardian_user_id,familyUser,'CPF cadastrado para conta antiga não cria outra conta');
    await as(adminA);
    await assert.rejects(db.query('select public.family_cpf_register($1,$2,$3,$4)',[
      schoolA,studentA,'Outra Pessoa','52998224725',
    ]),/outro nome/);
    const samePerson=await db.query('select public.family_cpf_register($1,$2,$3,$4) as id',[
      schoolA,studentA,'Maria da Silva','52998224725',
    ]);
    assert.equal((await db.query('select guardian_user_id from public.family_cpf_guardians where id=$1',[
      samePerson.rows[0].id,
    ])).rows[0].guardian_user_id,familyUser,'mesmo CPF e nome reutilizam a conta entre escolas');
  } finally { await db.close(); }
});
