begin;

-- Somente novos registros de permissao passam a nascer com a Frequencia
-- Assistida liberada. Nenhuma permissao existente e atualizada por esta
-- migration; administrador e coordenador autorizado continuam podendo
-- desmarcar a opcao pela tela de permissoes.
alter table public.school_member_permissions
  alter column can_import_siap_attendance set default true;

comment on column public.school_member_permissions.can_import_siap_attendance is
  'Libera a Frequencia Assistida. Novos membros recebem acesso por padrao; administrador ou coordenador autorizado pode remover o acesso.';

commit;
