-- STEP 14-C REVIEW ONLY / NOT APPLIED. Requires reviewed 14-A/B1/B2 contracts.
-- IMPORTANT: no authoritative deployed user_profiles role CHECK/login/RLS/RPC
-- definitions exist locally. Fill the two reviewed CHECK constants below only
-- after catalog inspection in an approved disposable DB; otherwise aborts BEFORE DDL.
-- No existing Auth/user/participant data migration or deletion is performed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_catalog.pg_advisory_xact_lock(714003);
do $$
declare
  reviewed_check_name constant text := '__REVIEW_ROLE_CHECK_NAME__';
  reviewed_check_definition constant text := '__REVIEW_EXACT_PG_GET_CONSTRAINTDEF__';
  actual text;
begin
  if pg_catalog.to_regclass('public.company_manager_accounts') is not null
    or pg_catalog.to_regnamespace('secondcareer_manager_private') is not null then raise exception 'SCHEMA_REVIEW_REQUIRED: objects already exist'; end if;
  select pg_catalog.pg_get_constraintdef(c.oid) into actual from pg_catalog.pg_constraint c
    where c.conrelid='public.user_profiles'::regclass and c.contype='c' and c.conname=reviewed_check_name;
  if actual is distinct from reviewed_check_definition then raise exception 'SCHEMA_REVIEW_REQUIRED: exact existing role CHECK approval required'; end if;
  -- Only this explicitly reviewed role CHECK is replaced, never unknown constraints.
  execute pg_catalog.format('alter table public.user_profiles drop constraint %I',reviewed_check_name);
end $$;
alter table public.user_profiles add constraint user_profiles_role_with_company_manager_check
  check(role in ('participant','counselor','admin','company_manager'));

create table public.company_manager_accounts (
  user_id uuid primary key,
  organization_id uuid not null,
  manager_role text generated always as ('company_manager'::text) stored not null,
  email text not null check(char_length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  email_key text generated always as (lower(btrim(email))) stored,
  phone text not null check(char_length(phone)<=30 and phone ~ '^[+0-9() .-]+$' and char_length(regexp_replace(phone,'[^0-9]','','g')) between 7 and 20),
  status text not null default 'active' check(status in ('active','suspended')),
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id,user_id), unique(organization_id,email_key),
  foreign key(organization_id,user_id,manager_role) references public.user_profiles(organization_id,user_id,role) on update restrict on delete restrict
);
create table public.company_manager_access (
  organization_id uuid not null,
  company_id uuid not null,
  manager_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(organization_id,company_id,manager_user_id),
  foreign key(organization_id,company_id) references public.client_companies(organization_id,id) on delete restrict,
  foreign key(organization_id,manager_user_id) references public.company_manager_accounts(organization_id,user_id) on delete restrict
);
create index company_manager_access_by_user on public.company_manager_access(organization_id,manager_user_id,company_id);
create table public.company_manager_registration_requests (
  id uuid primary key,
  actor_user_id uuid not null references public.user_profiles(user_id),
  organization_id uuid not null,
  company_id uuid not null,
  display_name text not null check(char_length(btrim(display_name)) between 1 and 100),
  email text not null,
  email_key text generated always as (lower(btrim(email))) stored,
  phone text not null,
  login_id text not null unique check(login_id ~ '^cm_[a-f0-9]{16}$'),
  status text not null default 'pending' check(status in ('pending','complete','cancelled')),
  auth_user_id uuid,
  created_at timestamptz not null default now(),
  unique(organization_id,email_key),
  foreign key(organization_id,company_id) references public.client_companies(organization_id,id) on delete restrict,
  check(status<>'complete' or auth_user_id is not null)
);
create index manager_requests_company on public.company_manager_registration_requests(organization_id,company_id);
alter table public.company_manager_accounts enable row level security;
alter table public.company_manager_access enable row level security;
alter table public.company_manager_registration_requests enable row level security;
revoke all on public.company_manager_accounts,public.company_manager_access,public.company_manager_registration_requests from public,anon,authenticated,service_role;
grant select on public.company_manager_accounts,public.company_manager_access,public.company_manager_registration_requests to service_role;
grant insert(user_id,organization_id,email,phone) on public.company_manager_accounts to service_role;
grant insert(organization_id,company_id,manager_user_id) on public.company_manager_access to service_role;
grant insert(id,actor_user_id,organization_id,company_id,display_name,email,phone,login_id) on public.company_manager_registration_requests to service_role;
grant update(status,must_change_password) on public.company_manager_accounts to service_role;
grant delete on public.company_manager_access to service_role;
grant update(status,auth_user_id) on public.company_manager_registration_requests to service_role;
-- No client access, no account DELETE, no credential/password column.

create function public.secondcareer_complete_manager_registration(request_id uuid,new_user_id uuid,new_internal_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.company_manager_registration_requests%rowtype;
begin
  select * into strict r from public.company_manager_registration_requests where id=request_id for update;
  if r.status<>'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  if not exists(select 1 from public.user_profiles where user_id=r.actor_user_id and organization_id=r.organization_id and role='admin')
    or not exists(select 1 from public.client_companies where id=r.company_id and organization_id=r.organization_id)
    or not exists(select 1 from auth.users where id=new_user_id and email=new_internal_email and raw_app_meta_data->>'registration_request_id'=request_id::text
      and raw_app_meta_data->'must_change_password'='true'::jsonb) then raise exception 'FORBIDDEN'; end if;
  insert into public.user_profiles(user_id,organization_id,role,display_name) values(new_user_id,r.organization_id,'company_manager',r.display_name);
  insert into public.server_login_lookup(user_id,login_id,internal_email) values(new_user_id,r.login_id,new_internal_email);
  insert into public.company_manager_accounts(user_id,organization_id,email,phone) values(new_user_id,r.organization_id,r.email,r.phone);
  insert into public.company_manager_access(organization_id,company_id,manager_user_id) values(r.organization_id,r.company_id,new_user_id);
  update public.company_manager_registration_requests set status='complete',auth_user_id=new_user_id where id=request_id;
  return pg_catalog.jsonb_build_object('managerId',new_user_id,'loginId',r.login_id);
end $$;
create function public.secondcareer_recover_manager_registration(request_id uuid,new_user_id uuid,new_internal_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.company_manager_registration_requests%rowtype;
begin
  select * into strict r from public.company_manager_registration_requests where id=request_id for update;
  if r.status='complete' and r.auth_user_id=new_user_id then return pg_catalog.jsonb_build_object('outcome','complete','managerId',new_user_id,'loginId',r.login_id); end if;
  if r.status<>'pending' or not exists(select 1 from auth.users where id=new_user_id and email=new_internal_email and raw_app_meta_data->>'registration_request_id'=request_id::text)
    or exists(select 1 from public.user_profiles where user_id=new_user_id)
    or exists(select 1 from public.server_login_lookup where user_id=new_user_id) then raise exception 'RECOVERY_CONFLICT'; end if;
  update public.company_manager_registration_requests set status='cancelled',auth_user_id=new_user_id where id=request_id;
  -- No deletion. Orphan Auth has no profile/mapping/access and stays blocked;
  -- preserve reservation for approved reconciliation, never automatic retry/reissue.
  return pg_catalog.jsonb_build_object('outcome','cancelled');
end $$;
create function public.secondcareer_manager_password_changed(manager_user_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from auth.users where id=manager_user_id
    and raw_app_meta_data->'must_change_password'='false'::jsonb and raw_app_meta_data->'temporary_password_digest'='null'::jsonb) then raise exception 'PASSWORD_NOT_CHANGED'; end if;
  update public.company_manager_accounts set must_change_password=false where user_id=manager_user_id and status='active';
  return found;
end $$;
revoke all on function public.secondcareer_complete_manager_registration(uuid,uuid,text),public.secondcareer_recover_manager_registration(uuid,uuid,text),public.secondcareer_manager_password_changed(uuid) from public,anon,authenticated;
grant execute on function public.secondcareer_complete_manager_registration(uuid,uuid,text),public.secondcareer_recover_manager_registration(uuid,uuid,text),public.secondcareer_manager_password_changed(uuid) to service_role;

-- Defense in depth against old broad authenticated policies. Inspect the COMPLETE
-- deployed exposed-table/RPC inventory before enabling; this is not an RLS audit pass.
-- A private definer is necessary to read roles without recursive user_profiles RLS.
create schema secondcareer_manager_private;
revoke all on schema secondcareer_manager_private from public,anon;
grant usage on schema secondcareer_manager_private to authenticated;
create function secondcareer_manager_private.legacy_role_allowed() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_profiles p where p.user_id=(select auth.uid()) and p.role in ('participant','counselor','admin'));
$$;
revoke all on function secondcareer_manager_private.legacy_role_allowed() from public,anon;
grant execute on function secondcareer_manager_private.legacy_role_allowed() to authenticated;
do $$
declare t text;
begin
  foreach t in array array['participants','assessments','assessment_history','user_profiles','server_login_lookup','organizations','participant_registration_requests'] loop
    if pg_catalog.to_regclass('public.'||t) is null then raise exception 'SCHEMA_REVIEW_REQUIRED: missing sensitive table %',t; end if;
    execute pg_catalog.format('alter table public.%I enable row level security',t);
    execute pg_catalog.format('create policy company_manager_deny on public.%I as restrictive for all to authenticated using ((select secondcareer_manager_private.legacy_role_allowed())) with check ((select secondcareer_manager_private.legacy_role_allowed()))',t);
  end loop;
end $$;
-- Existing company master / counselor / link tables already revoke all direct clients.
-- Review additional deployed tables, SECURITY DEFINER RPCs, grants, role CHECKs,
-- Auth hooks and login implementation first; never remove unknown policies to apply.
-- Reapplication/collision fails and rolls back the complete transaction.
commit;
