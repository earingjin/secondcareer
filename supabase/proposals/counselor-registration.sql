-- REVIEW ONLY. Not a migration. Never execute against production as-is.
-- Requires confirmed live schema, constraints, Auth hooks, grants and password
-- gates on ALL direct data/RPC paths. See counselor-registration.md.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'SCHEMA_REVIEW_REQUIRED: replace this stop only after documented catalog/RLS/Auth review';
end $$;

-- Minimal durable reservation is necessary before the non-transactional Auth
-- call. Existing participant/manager journals have incompatible required fields.
create table public.counselor_registration_requests (
  id uuid primary key,
  actor_user_id uuid not null references auth.users(id),
  organization_id uuid not null references public.organizations(id),
  login_id text not null unique check(login_id ~ '^[a-z0-9][a-z0-9_-]{5,31}$'),
  display_name text not null check(char_length(display_name) between 1 and 100),
  status text not null default 'pending' check(status in ('pending','complete')),
  auth_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check((status='pending' and auth_user_id is null) or (status='complete' and auth_user_id is not null))
);
alter table public.counselor_registration_requests enable row level security;
revoke all on public.counselor_registration_requests from public,anon,authenticated;
grant select,insert,update on public.counselor_registration_requests to service_role;

create function public.secondcareer_complete_counselor_registration(request_id uuid,new_user_id uuid,new_internal_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.counselor_registration_requests%rowtype;
  a auth.users%rowtype;
  actor auth.users%rowtype;
begin
  select * into strict r from public.counselor_registration_requests where id=request_id for update;
  -- Serialize changes to the actor profile while linking the account.
  perform 1 from public.user_profiles p where p.user_id=r.actor_user_id
    and p.organization_id=r.organization_id and p.role='admin' for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into strict actor from auth.users where id=r.actor_user_id for share;
  if jsonb_typeof(actor.raw_app_meta_data) is distinct from 'object'
    or not coalesce((actor.raw_app_meta_data->'must_change_password'='false'::jsonb
      or (not (actor.raw_app_meta_data ? 'must_change_password') and not (actor.raw_app_meta_data ? 'registration_request_id'))),false) then
    raise exception 'FORBIDDEN';
  end if;
  select * into strict a from auth.users where id=new_user_id for share;
  if a.email is distinct from new_internal_email
    or a.email is distinct from ('sp-'||encode(sha256(convert_to(r.login_id,'UTF8')),'hex')||'@accounts.example.invalid')
    or a.raw_app_meta_data->>'registration_request_id' is distinct from request_id::text
    or a.raw_app_meta_data->'must_change_password' is distinct from 'true'::jsonb
    or coalesce(a.raw_app_meta_data->>'temporary_password_digest','') !~ '^[a-f0-9]{64}$' then
    raise exception 'AUTH_CONTRACT_MISMATCH';
  end if;
  if r.status='complete' then
    if r.auth_user_id is distinct from new_user_id or not exists(
      select 1 from public.user_profiles p join public.server_login_lookup l on l.user_id=p.user_id
      where p.user_id=new_user_id and p.organization_id=r.organization_id and p.role='counselor'
        and p.display_name=r.display_name and l.login_id=r.login_id and l.internal_email=new_internal_email
    ) then raise exception 'COMPLETION_CONFLICT'; end if;
  else
    insert into public.user_profiles(user_id,organization_id,role,display_name)
      values(new_user_id,r.organization_id,'counselor',r.display_name);
    insert into public.server_login_lookup(user_id,login_id,internal_email)
      values(new_user_id,r.login_id,new_internal_email);
    update public.counselor_registration_requests set status='complete',auth_user_id=new_user_id where id=request_id;
  end if;
  return jsonb_build_object('counselorId',new_user_id,'loginId',r.login_id);
end $$;
revoke all on function public.secondcareer_complete_counselor_registration(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.secondcareer_complete_counselor_registration(uuid,uuid,text) to service_role;
-- No policy changes to existing tables: confirm restrictive password_ready()
-- policies also gate counselor access, not only participant-owned rows.
commit;
