const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {PGlite} = require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('leitura registra a turma e avisa cada responsável uma vez na mesma transação', async () => {
  const db = new PGlite();
  const school='11111111-1111-4111-8111-111111111111';
  const staff='22222222-2222-4222-8222-222222222222';
  const classId='33333333-3333-4333-8333-333333333333';
  const student='44444444-4444-4444-8444-444444444444';
  const nextStudent='55555555-5555-4555-8555-555555555555';
  const token='66666666-6666-4666-8666-666666666666';
  const nextToken='77777777-7777-4777-8777-777777777777';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('app.user_id',true),'')::uuid $$;
      create table public.school_members(school_id uuid,user_id uuid,status text,role text);
      create function public.family_school_manager(p_school_id uuid) returns boolean
        language sql stable as $$select exists(select 1 from public.school_members
          where school_id=p_school_id and user_id=auth.uid() and status='active' and role='school_admin')$$;
      create table public.classes(id uuid primary key,school_id uuid,name text,archived_at timestamptz);
      create table public.students(id uuid primary key,school_id uuid,class_id uuid,full_name text,enrollment_status text);
      create table public.family_student_cards(id uuid primary key default gen_random_uuid(),
        school_id uuid,student_id uuid,qr_token uuid,revoked_at timestamptz);
      create table public.family_student_entries(id uuid primary key default gen_random_uuid(),
        school_id uuid,student_id uuid,student_name text,card_id uuid,scanned_by uuid,
        class_id uuid,class_name text,arrived_at timestamptz not null default now(),
        family_message_id uuid,published_by uuid,published_at timestamptz);
      create table public.family_messages(id uuid primary key default gen_random_uuid(),
        school_id uuid,student_id uuid,student_name text,category text,title text,body text,
        entry_event_id uuid unique,published_by uuid,published_at timestamptz not null default now(),
        status text not null default 'published');
      create table public.family_links(id uuid primary key,school_id uuid,student_id uuid,
        guardian_user_id uuid,status text,accepted_at timestamptz);
      create table public.family_receipts(message_id uuid,link_id uuid,primary key(message_id,link_id));
      create table public.user_notifications(recipient_id uuid,school_id uuid,title text,body text,
        target_type text,target_id text);
      create table public.family_audit(school_id uuid,actor_id uuid,action text,subject_id uuid);
      create function public.can_receive_family_notification(p_user uuid,p_school uuid,p_message uuid)
        returns boolean language sql stable as $$select true$$;
    `);
    const foundation=readFileSync(path.join(__dirname,'..','supabase/migrations/167_family_cards_and_entry.sql'),'utf8');
    const publish=foundation.match(/create function public\.family_publish_entry\(p_school_id uuid,p_entry_id uuid\)[\s\S]*?(?=revoke all on function public\.family_publish_entry)/)?.[0];
    assert.ok(publish);
    await db.exec(publish);
    await db.exec(readFileSync(path.join(__dirname,'..','supabase/migrations/208_family_entry_automatic_notification.sql'),'utf8'));
    await db.exec(`create trigger family_push after insert on public.family_receipts
      for each row execute function public.queue_family_push_for_receipt()`);
    await db.query('insert into public.school_members values($1,$2,$3,$4)',[school,staff,'active','school_admin']);
    await db.query('insert into public.classes values($1,$2,$3,null)',[classId,school,'6A']);
    await db.query('insert into public.students values($1,$2,$3,$4,$5),($6,$2,$3,$7,$5)',
      [student,school,classId,'Aluno Um','active',nextStudent,'Aluno Dois']);
    await db.query('insert into public.family_student_cards(school_id,student_id,qr_token) values($1,$2,$3),($1,$4,$5)',
      [school,student,token,nextStudent,nextToken]);
    await db.query(`insert into public.family_links values($1,$2,$3,$4,$5,now()-interval '1 day'),($6,$2,$3,$7,$5,now()-interval '1 day')`,
      ['88888888-8888-4888-8888-888888888888',school,student,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','active',
        '99999999-9999-4999-8999-999999999999','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']);
    await db.query('select set_config($1,$2,false)',['app.user_id',staff]);

    const first=(await db.query('select * from public.family_record_entry($1,$2)',[school,token])).rows[0];
    assert.equal(first.student_id,student);
    assert.equal(first.duplicate,false);
    const entry=(await db.query('select class_id,class_name,published_at is not null as published from public.family_student_entries where id=$1',[first.entry_id])).rows[0];
    assert.equal(entry.class_id,classId);
    assert.equal(entry.class_name,'6A');
    assert.equal(entry.published,true);
    const notices=(await db.query('select recipient_id,title,body from public.user_notifications order by recipient_id')).rows;
    assert.equal(notices.length,2);
    assert.equal(notices[0].title,'Entrada na escola');
    assert.match(notices[0].body,/Aluno Um: Entrada registrada em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/);

    const repeated=(await db.query('select * from public.family_record_entry($1,$2)',[school,token])).rows[0];
    assert.equal(repeated.duplicate,true);
    assert.equal(repeated.entry_id,first.entry_id);
    assert.equal((await db.query('select count(*)::int as total from public.family_student_entries')).rows[0].total,1);
    assert.equal((await db.query('select count(*)::int as total from public.user_notifications')).rows[0].total,2);
    await db.exec(`create or replace function public.family_publish_entry(p_school_id uuid,p_entry_id uuid)
      returns uuid language plpgsql as $$begin raise exception 'Falha de publicação'; end;$$`);
    await assert.rejects(db.query('select * from public.family_record_entry($1,$2)',[school,nextToken]),/Falha de publicação/);
    assert.equal((await db.query('select count(*)::int as total from public.family_student_entries')).rows[0].total,1);
    await db.query('select set_config($1,$2,false)',['app.user_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc']);
    await assert.rejects(db.query('select * from public.family_record_entry($1,$2)',[school,token]),/Sem permissão/);
  } finally { await db.close(); }
});
