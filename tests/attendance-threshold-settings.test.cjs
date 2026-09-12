const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assisted-attendance.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '117_school_attendance_thresholds.sql'), 'utf8');

assert.match(source, /DEFAULT_THRESHOLDS = Object\.freeze\(\{ frequentMinimum:75, absentMinimum:60 \}\)/);
assert.match(source, /data-aa-frequent-minimum/);
assert.match(source, /data-aa-absent-minimum/);
assert.match(source, /Usar cálculo padrão/);
assert.match(source, /thresholdExplanation/);
assert.match(source, /\.delete\(\)\.eq\('school_id',schoolId\)/);
assert.match(source, /classify\(Number\(item\.percentage\)\)/);
assert.match(migration, /school_id uuid primary key/);
assert.match(migration, /check \(absent_minimum < frequent_minimum\)/);
assert.match(migration, /is_active_school_member\(school_id\)/);
assert.match(migration, /is_school_admin\(school_id\) or public\.is_school_coordinator\(school_id\)/);
assert.doesNotMatch(migration, /to anon/);

console.log('Percentuais de frequência configuráveis por escola preservam padrão, explicação e isolamento.');
