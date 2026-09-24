begin;

-- Vincula explicitamente a ressalva à mesma escola da ocorrência.
drop policy if exists "view_occurrence_remarks" on public.student_occurrence_remarks;
create policy "view_occurrence_remarks"
on public.student_occurrence_remarks for select to authenticated
using (exists (
  select 1 from public.student_occurrences occurrence
  where occurrence.id = student_occurrence_remarks.occurrence_id
    and occurrence.school_id = student_occurrence_remarks.school_id
));

commit;
