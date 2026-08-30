-- CARÔMETRO COMERCIAL
-- Fundação de banco para o Responsável pela Assinatura (responsável
-- comercial da escola), independente de school_admin.
--
-- Migration puramente aditiva: cria uma tabela nova, sem tocar em
-- schools, school_subscriptions, school_members, transfer_school_admin,
-- manage-user, nenhuma Edge Function nem nenhum frontend.
--
-- Desenho:
--   - school_id é a própria chave primária (1 responsável por escola,
--     igual ao padrão já usado em school_subscriptions.school_id UNIQUE),
--     com ON DELETE CASCADE — o registro só faz sentido enquanto a
--     escola existir.
--   - user_id é OPCIONAL e ON DELETE SET NULL (nunca CASCADE): o
--     responsável comercial pode não ter conta no Carômetro, e mesmo
--     quando tem, excluir essa conta (manage-user) nunca apaga o
--     contato — nome/e-mail/telefone continuam gravados como texto
--     simples, não derivados ao vivo de auth.users. Por isso não é
--     necessária (nem foi criada) nenhuma proteção nova em manage-user:
--     diferente de school_admin (cuja remoção deixaria a escola sem
--     administrador), aqui a exclusão da conta vinculada nunca deixa a
--     escola sem responsável comercial identificável.
--   - updated_by também é ON DELETE SET NULL, pelo mesmo motivo: quem
--     fez a última alteração pode deixar de ter conta sem que isso
--     apague o rastro de quem alterou.
--   - Nenhuma FK para school_members nem para school_subscriptions —
--     mantém este conceito estruturalmente desacoplado de administração
--     escolar e de estado de plano/assinatura, exatamente como já
--     acontece hoje entre school_subscriptions e school_members. É essa
--     ausência de FK (não uma regra de código) que garante, por
--     construção, que transferir school_admin nunca precisa saber que
--     esta tabela existe.
--   - Sem CHECK de formato de e-mail/telefone (evitar regex rígido);
--     só normalização mínima (trim + minúsculas no e-mail, mesmo padrão
--     já usado em school_invitations.email) e não-vazio em nome/e-mail.
--     Telefone fica livre, sem validação de formato.
--
-- Segurança: contém PII (nome, e-mail, telefone). RLS ativada e,
-- deliberadamente, SEM NENHUMA POLICY nesta fase — nem para
-- authenticated, nem para anon, nem uma policy "provisória" de leitura
-- para o proprietário. Isso bloqueia todo acesso via PostgREST
-- (professor/coordenador/school_admin/anon incluídos) até que RPCs
-- SECURITY DEFINER dedicadas sejam criadas (fase futura, junto da
-- auditoria de billing_contact_changed) — essas RPCs não precisarão de
-- nenhuma policy, pois rodam com o privilégio do dono da função, como já
-- acontece com toda a escrita de school_subscriptions hoje.

begin;

create table public.school_billing_contacts (
  school_id uuid primary key references public.schools(id) on delete cascade,
  full_name text not null
    check (full_name = btrim(full_name) and full_name <> ''),
  email text not null
    check (email = lower(btrim(email)) and email <> ''),
  phone text null,
  user_id uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.school_billing_contacts enable row level security;

commit;
