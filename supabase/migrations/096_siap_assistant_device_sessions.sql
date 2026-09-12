begin;

create table if not exists public.siap_assistant_device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint siap_assistant_device_sessions_expiry_check
    check (expires_at > created_at)
);

create index if not exists siap_assistant_device_sessions_user_idx
  on public.siap_assistant_device_sessions(user_id, expires_at desc);

alter table public.siap_assistant_device_sessions enable row level security;

revoke all on table public.siap_assistant_device_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.siap_assistant_device_sessions to service_role;

comment on table public.siap_assistant_device_sessions is
  'Sessões revogáveis e limitadas à IA do Assistente SIAP; armazena somente hash do token do dispositivo.';

commit;
