-- CARÔMETRO: permite ao usuário "limpar" (dispensar) suas notificações do sininho
-- sem apagar a linha nem afetar os registros de origem (alertas/acompanhamentos)
-- e sem afetar notificações de outros usuários.
-- Execute uma vez no Supabase SQL Editor, após supabase-workflow-improvements.sql.

alter table public.user_notifications add column if not exists dismissed_at timestamptz;

create index if not exists user_notifications_recipient_visible_idx
  on public.user_notifications(recipient_id, dismissed_at, created_at desc);

-- Reaproveita a policy de update já existente ("Update own notifications"),
-- que já restringe a alteração à própria linha do usuário (recipient_id = auth.uid()).
-- Nenhuma policy nova é necessária.
