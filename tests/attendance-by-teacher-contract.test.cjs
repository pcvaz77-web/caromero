const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase','migrations','118_attendance_by_teacher_and_subject.sql'),'utf8');
const reports=fs.readFileSync(path.join(root,'reports.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');

assert.match(migration,/unique \(school_id, student_id, subject, academic_year, term, updated_by\)/);
assert.match(migration,/unique \(school_id, student_id, period_key, imported_by\)/);
assert.match(migration,/and updated_by=auth\.uid\(\)/);
assert.match(migration,/on conflict \(school_id,student_id,subject,academic_year,term,updated_by\)/);
assert.match(migration,/on conflict \(school_id,student_id,period_key,imported_by\)/);
assert.match(migration,/create or replace function public\.report_siap_attendance_current/);
assert.match(migration,/create or replace function public\.report_siap_attendance_events/);
assert.match(migration,/sm\.role in \('school_admin','coordinator'\)/);
assert.match(migration,/where a\.school_id=p_school_id/);
assert.match(migration,/where e\.school_id=p_school_id/);
assert.match(migration,/revoke all on function public\.report_siap_attendance_current\(uuid\) from public/);
assert.match(reports,/attendanceCurrentByStudent/);
assert.match(reports,/Frequência por disciplina e histórico/);
assert.match(index,/reports\.js\?v=12/);

console.log('Frequência atual e histórico ficam separados por professor, disciplina, escola e período.');
