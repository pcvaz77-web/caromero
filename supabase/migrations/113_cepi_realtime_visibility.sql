-- Atualiza imediatamente a visibilidade do menu CEPI para os usuários da
-- escola afetada. O canal escolar já possui Realtime e polling de contingência.

begin;

drop trigger if exists emit_cepi_setting_change_realtime_event on public.school_cepi_settings;
create trigger emit_cepi_setting_change_realtime_event
after insert or update on public.school_cepi_settings
for each row execute function public.emit_school_realtime_event();

commit;
