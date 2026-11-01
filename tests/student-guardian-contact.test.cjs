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
const registrationMigration = read('supabase/migrations/209_student_registration_and_automatic_guardian_card.sql');

test('formulario traz contato e matrícula sem caixas de exibição', () => {
  assert.match(index, /id="fullName"[\s\S]*id="guardianContactFields"[\s\S]*id="guardianName"[\s\S]*id="guardianPhone"/);
  assert.match(index, /id="studentRegistration"/);
  assert.doesNotMatch(index, /id="showGuardianOnCard"/);
  assert.doesNotMatch(editor, /id="guardianHasWhatsapp"/);
  assert.match(editor, /\.guardian-contact-fields \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('contato aparece apenas no perfil aberto, fora da lista', () => {
  assert.doesNotMatch(index, /if\(!s\?\.showGuardianOnCard\)return''/);
  assert.match(index, /class="guardian-contact-pill"/);
  assert.match(index, /detailGuardian=detail\?guardianBadge\(detail\):''/);
  assert.match(index, /detailRegistration=detail\?registrationBadge\(detail\):''/);
  assert.match(index, /class="student-registration-pill"[^>]*><span>Matrícula:<\/span> \$\{esc\(s\.registrationNumber\)\}/);
  assert.match(index, /detailGuardian\|\|detailRegistration\|\|detail\.report\?/);
  assert.match(index, /<b>Informação<\/b>\$\{detailGuardian\}\$\{detailRegistration\}/);
  assert.match(index, /detailGuardian=detail\?guardianBadge\(detail\):''/);
  assert.match(index, /<div class="name">\$\{esc\(s\.name\)\}<\/div><div class="meta hidden"><\/div>/);
  assert.doesNotMatch(index, /<div class="name">\$\{esc\(s\.name\)\}<\/div>\$\{guardianBadge\(s\)\}/);
  assert.doesNotMatch(index, /<div class="name">\$\{esc\(s\.name\)\}<\/div>\$\{registrationBadge\(s\)\}/);
  assert.match(editor, /\.guardian-contact-pill,\.student-registration-pill \{[^}]*background:#f2f4f7;[^}]*color:#475467;/);
  assert.match(editor, /\.guardian-contact-pill \{ padding:0 5px 0 8px; \}/);
  assert.match(editor, /\.student-registration-pill \{ padding:4px 8px; \}/);
  assert.match(editor, /const source = row\.querySelector\('\.detail-observation-source'\)/);
  assert.match(editor, /row\.registration_number = studentRegistration\.value\.trim\(\) \|\| null/);
  assert.match(editor, /guardianName:\s*item\.guardian_name\s*\|\|\s*''/);
  assert.match(editor, /guardianPhone:\s*item\.guardian_phone\s*\|\|\s*''/);
  assert.match(editor, /registrationNumber: item\.registration_number \|\| ''/);
  assert.match(editor, /const subtitle = card\.querySelector\(':scope > div:nth-child\(2\) > \.meta'\)/);
  assert.doesNotMatch(editor, /card\.querySelector\('\.name'\)\?\.nextElementSibling/);
});

test('ícone do WhatsApp usa número válido sem confirmação por caixa', () => {
  assert.match(index, /number=window\.guardianWhatsappNumber\?\.\(s\.guardianPhone\)\|\|''/);
  assert.match(index, /class="guardian-whatsapp-link" onclick="event\.stopPropagation\(\)" href="https:\/\/wa\.me\/\$\{number\}"/);
  assert.match(editor, /\.guardian-contact-pill \.guardian-whatsapp-link svg \{[^}]*width:20px; height:20px/);
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
  assert.match(registrationMigration, /drop constraint if exists students_guardian_whatsapp_phone/);
});

test('versoes publicas invalidam o cache dos arquivos alterados', () => {
  assert.match(index, /student-edit-improvements\.js\?v=120/);
});
