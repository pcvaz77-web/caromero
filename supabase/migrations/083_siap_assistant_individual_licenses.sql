-- CARÔMETRO COMERCIAL
-- Licença individual do Assistente SIAP, isolada das assinaturas das escolas.
-- O teste gratuito começa somente na primeira ativação autenticada e não pode
-- ser reiniciado removendo/recriando a permissão escolar.

begin;

create table if not exists public.siap_assistant_licenses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entitlement_type text not null default 'trial'
    check (entitlement_type in ('trial', 'subscription', 'manual')),
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  paid_until timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint siap_assistant_trial_period_valid
    check (trial_ends_at = trial_started_at + interval '30 days')
);

alter table public.siap_assistant_licenses enable row level security;

drop policy if exists "users_can_view_own_siap_assistant_license"
  on public.siap_assistant_licenses;
create policy "users_can_view_own_siap_assistant_license"
on public.siap_assistant_licenses
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.siap_assistant_licenses from public, anon, authenticated;
grant select on table public.siap_assistant_licenses to authenticated;

create or replace function public.activate_siap_assistant_trial()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_license public.siap_assistant_licenses%rowtype;
  v_now timestamptz := now();
  v_allowed boolean := false;
  v_effective_end timestamptz;
  v_active boolean;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.school_members sm
    left join public.school_member_permissions smp on smp.member_id = sm.id
    where sm.user_id = v_user_id
      and sm.status = 'active'
      and (sm.role = 'school_admin' or coalesce(smp.can_use_siap_assistant, false))
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Assistente SIAP não autorizado.' using errcode = '42501';
  end if;

  insert into public.siap_assistant_licenses (
    user_id, entitlement_type, trial_started_at, trial_ends_at
  ) values (
    v_user_id, 'trial', v_now, v_now + interval '30 days'
  )
  on conflict (user_id) do nothing;

  select * into v_license
  from public.siap_assistant_licenses
  where user_id = v_user_id;

  v_effective_end := greatest(v_license.trial_ends_at, coalesce(v_license.paid_until, '-infinity'::timestamptz));
  v_active := v_license.suspended_at is null and v_effective_end > v_now;

  return jsonb_build_object(
    'active', v_active,
    'status', case
      when v_license.suspended_at is not null then 'suspended'
      when v_active and v_license.paid_until is not null and v_license.paid_until >= v_license.trial_ends_at then 'subscribed'
      when v_active then 'trial'
      else 'expired'
    end,
    'trialStartedAt', v_license.trial_started_at,
    'trialEndsAt', v_license.trial_ends_at,
    'accessEndsAt', v_effective_end,
    'daysRemaining', greatest(0, ceil(extract(epoch from (v_effective_end - v_now)) / 86400.0)::integer)
  );
end;
$function$;

revoke all on function public.activate_siap_assistant_trial() from public, anon;
grant execute on function public.activate_siap_assistant_trial() to authenticated;

comment on table public.siap_assistant_licenses is
  'Licenças individuais do Assistente SIAP; não altera nem depende do plano comercial da escola.';
comment on function public.activate_siap_assistant_trial() is
  'Ativa uma única vez o teste gratuito individual de 30 dias e devolve o estado efetivo da licença.';

commit;
