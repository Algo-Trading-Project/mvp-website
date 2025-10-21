-- Helper to introspect PostgREST JWT claims under RLS impersonation
create or replace function public.rpc_whoami()
returns table(
  sub text,
  role text,
  claims jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    current_setting('request.jwt.claim.sub', true),
    current_setting('request.jwt.claim.role', true),
    to_jsonb(current_setting('request.jwt.claims', true));
$$;

