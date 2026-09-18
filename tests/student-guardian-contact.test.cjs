const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const index = read('index.html');
const editor = read('student-edit-improvements.js');
const permissions = read('permissions-and-details.js');
const migration = read('supabase/migrations/129_student_guardian_contact.sql');

test('formulario traz os dois campos lado a lado e a marcacao do card', () => {
  assert.match(index, /id="fullName"[\s\S]*id="guardianContactFields"[\s\S]*id="guardianName"[\s\S]*id="guardianPhone"/);
  assert.match(index, /id="showGuardianOnCard"[\s\S]*Exibir como etiqueta no card do aluno/);
  assert.match(editor, /\.guardian-contact-fields \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('etiqueta cinza so aparece quando o aluno estiver marcado', () => {
  assert.match(index, /if\(!s\?\.showGuardianOnCard\)return''/);
  assert.match(index, /class="guardian-contact-pill"/);
  assert.match(index, /detailGuardian=detail\?guardianBadge\(detail\):''/);
  assert.match(index, /<b>Informação<\/b>\$\{detailGuardian\}\$\{detail\.report\?/);
  assert.match(index, /<div class="name">\$\{esc\(s\.name\)\}<\/div><div class="meta hidden">/);
  assert.doesNotMatch(index, /<div class="name">\$\{esc\(s\.name\)\}<\/div>\$\{guardianBadge\(s\)\}/);
  assert.match(editor, /\.guardian-contact-pill \{[^}]*background:#f2f4f7;[^}]*color:#475467;/);
  assert.match(editor, /const source = row\.querySelector\('\.detail-observation-source'\)/);
  assert.match(editor, /row\.show_guardian_on_card = showGuardianOnCard\.checked/);
  assert.match(editor, /guardianName:\s*item\.guardian_name\s*\|\|\s*''/);
  assert.match(editor, /guardianPhone:\s*item\.guardian_phone\s*\|\|\s*''/);
  assert.match(editor, /showGuardianOnCard:\s*!!item\.show_guardian_on_card/);
  assert.match(editor, /const subtitle = card\.querySelector\(':scope > div:nth-child\(2\) > \.meta'\)/);
  assert.doesNotMatch(editor, /card\.querySelector\('\.name'\)\?\.nextElementSibling/);
});

test('permissao especifica aparece para professor coordenacao secretaria e administrador', () => {
  assert.match(permissions, /permissionFields = \[[^\]]*'can_edit_guardian_contact'/);
  assert.match(permissions, /setGeneralPermission'[\s\S]{0,180}Editar dados do responsável|can_edit_guardian_contact','Editar dados do responsável'[^\n]*setGeneralPermission/);
  assert.ok((permissions.match(/can_edit_guardian_contact','Editar dados do responsável'/g) || []).length >= 3);
  assert.match(editor, /guardianContactFields\.classList\.toggle\('hidden', !canEditGuardianContact\)/);
});

test('banco protege os dados por escola e por permissao dedicada', () => {
  assert.match(migration, /add column if not exists guardian_name text null/);
  assert.match(migration, /add column if not exists guardian_phone text null/);
  assert.match(migration, /show_guardian_on_card boolean not null default false/);
  assert.match(migration, /can_edit_guardian_contact boolean not null default false/);
  assert.match(migration, /sm\.school_id=target_school_id[\s\S]*sm\.user_id=auth\.uid\(\)[\s\S]*sm\.status='active'/);
  assert.match(migration, /before insert or update on public\.students/);
  assert.match(migration, /can_edit_student_guardian_contact\(school_id\)/);
  assert.match(migration, /'can_edit_guardian_contact','can_manage_observation_options'/);
  assert.match(migration, /can_edit_guardian_contact=false[\s\S]*can_import_school_daily_attendance=true/);
});

test('versoes publicas invalidam o cache dos arquivos alterados', () => {
  assert.match(index, /permissions-and-details\.js\?v=64/);
  assert.match(index, /student-edit-improvements\.js\?v=108/);
});
