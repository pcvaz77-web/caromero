-- Atualiza os valores antigos antes de restringir os novos valores permitidos.
update public.students
set has_report = case has_report
  when 'Sim' then 'Tem Laudo'
  when 'Laudo' then 'Tem Laudo'
  when 'Dificuldade grave' then 'Sem Laudo (Dificuldade Grave)'
  when 'Dificuldade leve' then 'Sem Laudo (Dificuldade Leve)'
  else has_report
end;

alter table public.students
drop constraint if exists students_has_report_check;

alter table public.students
add constraint students_has_report_check
check (has_report in (
  '',
  'Tem Laudo',
  'Sem Laudo (Dificuldade Grave)',
  'Sem Laudo (Dificuldade Leve)',
  'Não alfabetizado'
));
