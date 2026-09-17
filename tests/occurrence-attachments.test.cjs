const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const frontend = fs.readFileSync(path.join(root, 'occurrence-management.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '125_occurrence_attachments.sql'), 'utf8');
const deletionFunction = fs.readFileSync(path.join(root, 'supabase', 'functions', 'platform-delete-school', 'index.ts'), 'utf8');

test('a tela oferece anexo por uma janela separada', () => {
  assert.match(frontend, /Incluir documento/);
  assert.match(frontend, /Selecionar arquivo/);
  assert.match(frontend, /accept="image\/jpeg,image\/png,image\/webp,application\/pdf"/);
  assert.match(frontend, /MAX_ATTACHMENT_BYTES = 10 \* 1024 \* 1024/);
});

test('o anexo usa bucket privado e URL temporaria', () => {
  assert.match(frontend, /occurrence-attachments/);
  assert.match(frontend, /createSignedUrl\(item\.attachment_path, 60\)/);
  assert.match(migration, /'occurrence-attachments',[\s\S]*false,[\s\S]*10485760/);
  assert.match(migration, /school_members_can_view_occurrence_attachments/);
  assert.match(migration, /can_view_occurrences/);
  assert.match(migration, /occurrence\.id::text = \(storage\.foldername\(name\)\)\[3\]/);
  assert.match(migration, /occurrence\.created_by::text = \(storage\.foldername\(name\)\)\[2\]/);
});

test('a exclusao permanente da escola limpa fotos e anexos', () => {
  assert.match(deletionFunction, /\['student-photos', 'occurrence-attachments'\]/);
  assert.match(deletionFunction, /for \(const bucket of BUCKETS\)/);
});
