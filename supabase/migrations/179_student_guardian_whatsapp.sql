begin;

-- Identificação opcional feita pela escola; não verifica se o número está
-- cadastrado no WhatsApp. A conversa só é aberta por ação do usuário.
alter table public.students
  add column if not exists guardian_has_whatsapp boolean not null default false;

alter table public.students
  drop constraint if exists students_guardian_whatsapp_phone,
  add constraint students_guardian_whatsapp_phone check (
    not guardian_has_whatsapp or (
      guardian_phone is not null
      and (
        regexp_replace(guardian_phone, '[^0-9]', '', 'g') ~ '^[1-9][0-9]{9,10}$'
        or regexp_replace(guardian_phone, '[^0-9]', '', 'g') ~ '^55[1-9][0-9]{9,10}$'
      )
    )
  );

comment on column public.students.guardian_has_whatsapp is
  'A escola informou que o telefone do responsável é WhatsApp; não é verificação automática.';

-- Preserva a mesma permissão específica dos demais dados do responsável.
create or replace function public.enforce_student_guardian_contact_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_has_guardian_data boolean;
  v_guardian_changed boolean;
begin
  v_has_guardian_data := new.guardian_name is not null
    or new.guardian_phone is not null
    or new.show_guardian_on_card
    or new.guardian_has_whatsapp;

  v_guardian_changed := tg_op='INSERT' and v_has_guardian_data;
  if tg_op='UPDATE' then
    v_guardian_changed := old.guardian_name is distinct from new.guardian_name
      or old.guardian_phone is distinct from new.guardian_phone
      or old.show_guardian_on_card is distinct from new.show_guardian_on_card
      or old.guardian_has_whatsapp is distinct from new.guardian_has_whatsapp;
  end if;

  if v_guardian_changed
     and not public.can_edit_student_guardian_contact(new.school_id) then
    raise exception 'Sem permissao para editar os dados do responsavel pelo aluno';
  end if;

  return new;
end;
$function$;

commit;
