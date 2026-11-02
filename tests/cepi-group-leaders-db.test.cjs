const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {PGlite} = require('../services/siap-exam/node_modules/@electric-sql/pglite');

test('eletivas sem líderes são aceitas e clubes não repetem o mesmo aluno', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.cepi_groups (
        kind text not null,
        leader_student_id uuid,
        coleader_student_id uuid,
        constraint cepi_groups_check check (leader_student_id is distinct from coleader_student_id)
      );
    `);
    await assert.rejects(db.query("insert into public.cepi_groups(kind) values ('eletiva')"), /cepi_groups_check/);
    await db.exec(readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '210_cepi_groups_nullable_leaders.sql'), 'utf8'));
    await db.query("insert into public.cepi_groups(kind) values ('eletiva'), ('oficina'), ('clube')");
    await db.query("insert into public.cepi_groups(kind, leader_student_id) values ('clube', '11111111-1111-4111-8111-111111111111')");
    await db.query("insert into public.cepi_groups(kind, leader_student_id, coleader_student_id) values ('clube', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')");
    await assert.rejects(db.query("insert into public.cepi_groups(kind, leader_student_id, coleader_student_id) values ('clube', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111')"), /cepi_groups_distinct_leaders_check/);
    const result = await db.query('select kind from public.cepi_groups order by kind');
    assert.equal(result.rows.length, 5);
  } finally {
    await db.close();
  }
});
