-- Anos e séries aos quais uma questão do banco do Meu CEPI se destina.
-- As questões já existentes permanecem sem ano/série até serem editadas.
begin;

alter table public.cepi_question_bank
  add column target_grades text[] not null default '{}'::text[];

alter table public.cepi_question_bank
  add constraint cepi_question_bank_target_grades_stage_check check (
    array_position(target_grades, null) is null
    and (
      (stage = 'fundamental_ii' and target_grades <@ array['6','7','8','9']::text[])
      or (stage = 'medio' and target_grades <@ array['medio_1','medio_2','medio_3']::text[])
    )
  );

commit;
