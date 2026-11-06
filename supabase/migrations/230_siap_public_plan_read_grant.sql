-- RLS already limits public reads to active plans with a defined amount.
-- The table grant is also required for PostgREST to return those rows.
grant select on public.siap_assistant_plans to anon, authenticated;
