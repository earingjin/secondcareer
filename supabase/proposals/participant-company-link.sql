-- REVIEW PROPOSAL ONLY; NOT APPLIED. Requires reviewed client-companies.sql and
-- participant-registration.sql contracts. CLI/authoritative deployed RPC absent.
-- One transaction: any collision, FK violation or schema mismatch rolls back all DDL.
-- Re-running fails closed, never silently replaces existing functions/constraints.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_catalog.pg_advisory_xact_lock(714001);
do $$
begin
  if pg_catalog.to_regprocedure('public.secondcareer_complete_registration(uuid,uuid,text)') is null
    or pg_catalog.to_regclass('public.client_companies') is null
    or pg_catalog.to_regclass('public.participant_registration_requests') is null then
    raise exception 'SCHEMA_REVIEW_REQUIRED: baseline registration and company contracts required';
  end if;
  if exists(select 1 from pg_catalog.pg_attribute where attrelid='public.participants'::regclass
    and attname='company_id' and not attisdropped)
    or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('secondcareer_complete_company_registration','secondcareer_recover_company_registration','secondcareer_company_link_guard','secondcareer_company_request_guard')) then
    raise exception 'SCHEMA_REVIEW_REQUIRED: existing company link objects; do not overwrite';
  end if;
  if not pg_catalog.has_table_privilege('service_role','auth.users','SELECT') then
    raise exception 'SCHEMA_REVIEW_REQUIRED: Auth identity validation privilege required';
  end if;
end $$;

-- Existing NULL links and company_name values remain untouched. Organization is
-- part of the key: a valid UUID from another organization cannot be linked.
alter table public.client_companies add constraint client_companies_org_id_unique unique(organization_id,id);
alter table public.participants add column company_id uuid null;
alter table public.participants add constraint participants_company_org_required
  check(company_id is null or organization_id is not null);
alter table public.participants add constraint participants_company_org_fk
  foreign key(organization_id,company_id) references public.client_companies(organization_id,id) match simple on delete restrict;
create index participants_org_company_idx on public.participants(organization_id,company_id);
alter table public.participant_registration_requests add column company_id uuid null;
alter table public.participant_registration_requests add column company_cancelled_auth_user_id uuid null;
alter table public.participant_registration_requests add constraint registration_company_org_fk
  foreign key(organization_id,company_id) references public.client_companies(organization_id,id) match simple on delete restrict;
create index registration_org_company_idx on public.participant_registration_requests(organization_id,company_id);
alter table public.participant_registration_requests add constraint registration_company_cancel_check
  check(company_cancelled_auth_user_id is null or (company_id is not null and status='pending'));
-- Journal is already RLS-enabled and service-only; no new client grant/policy.
-- Preserve existing participant RLS/legacy column permissions. Block new link writes
-- even if the existing deployment grants table-level UPDATE to authenticated.
create function public.secondcareer_company_link_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if (tg_op='INSERT' and new.company_id is not null) or
    (tg_op='UPDATE' and (new.company_id is distinct from old.company_id or
      (new.company_id is not null and new.organization_id is distinct from old.organization_id))) then
    if current_user not in ('service_role','postgres') then raise exception 'FORBIDDEN'; end if;
  end if;
  return new;
end $$;
revoke all on function public.secondcareer_company_link_guard() from public,anon,authenticated;
create trigger participants_company_link_guard before insert or update on public.participants
  for each row execute function public.secondcareer_company_link_guard();

-- An accidentally routed old RPC must roll back rather than complete without ID.
create function public.secondcareer_company_request_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.company_id is not null and new.status='complete' and not exists(
    select 1 from public.participants p where p.id=new.participant_id
      and p.organization_id=new.organization_id and p.company_id=new.company_id
      and p.auth_user_id=new.auth_user_id
  ) then raise exception 'COMPANY_LINK_REQUIRED'; end if;
  return new;
end $$;
revoke all on function public.secondcareer_company_request_guard() from public,anon,authenticated;
create trigger registration_company_link_guard before update on public.participant_registration_requests
  for each row execute function public.secondcareer_company_request_guard();

create function public.secondcareer_complete_company_registration(request_id uuid,new_user_id uuid,new_internal_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r public.participant_registration_requests%rowtype;
  c public.client_companies%rowtype;
  participant uuid;
begin
  select * into strict r from public.participant_registration_requests where id=request_id for update;
  if r.status<>'pending' or r.company_id is null or r.company_cancelled_auth_user_id is not null then
    raise exception 'REQUEST_NOT_PENDING';
  end if;
  if not exists(select 1 from public.user_profiles a where a.user_id=r.actor_user_id and a.organization_id=r.organization_id and a.role='admin')
    or not exists(select 1 from public.user_profiles p where p.user_id=r.counselor_user_id and p.organization_id=r.organization_id and p.role='counselor') then
    raise exception 'FORBIDDEN';
  end if;
  -- Row lock serializes completion with company deactivation/rename.
  select * into strict c from public.client_companies where id=r.company_id and organization_id=r.organization_id for share;
  if c.status<>'active' then raise exception 'COMPANY_UNAVAILABLE'; end if;
  if not exists(select 1 from auth.users u where u.id=new_user_id and u.email=new_internal_email
    and u.raw_app_meta_data->>'registration_request_id'=request_id::text
    and u.raw_app_meta_data->'must_change_password'='true'::jsonb) then raise exception 'AUTH_MISMATCH'; end if;
  insert into public.user_profiles(user_id,organization_id,role,display_name)
    values(new_user_id,r.organization_id,'participant',r.display_name);
  insert into public.server_login_lookup(user_id,login_id,internal_email)
    values(new_user_id,r.login_id,new_internal_email);
  insert into public.participants(id,organization_id,counselor_user_id,auth_user_id,display_name,phone,company_name,company_id)
    values(pg_catalog.gen_random_uuid(),r.organization_id,r.counselor_user_id,new_user_id,r.display_name,r.phone,c.name,c.id)
    returning id into participant;
  update public.participant_registration_requests set status='complete',auth_user_id=new_user_id,participant_id=participant,company_name=c.name where id=request_id;
  return pg_catalog.jsonb_build_object('participantId',participant,'companyId',c.id,'companyName',c.name);
end $$;

-- Called only by the trusted registration handler for its newly-created Auth.
-- Same journal lock resolves commit-vs-timeout before any compensating Auth delete.
-- Cancelled marker prevents a late completion; reservations remain blocked for review.
create function public.secondcareer_recover_company_registration(request_id uuid,new_user_id uuid,new_internal_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.participant_registration_requests%rowtype;
begin
  select * into strict r from public.participant_registration_requests where id=request_id for update;
  if r.company_id is null then raise exception 'COMPANY_LINK_REQUIRED'; end if;
  if r.status='complete' then
    if r.auth_user_id<>new_user_id or not exists(select 1 from public.participants p
      where p.id=r.participant_id and p.auth_user_id=new_user_id and p.organization_id=r.organization_id and p.company_id=r.company_id) then
      raise exception 'RECOVERY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('outcome','complete','participantId',r.participant_id,'companyId',r.company_id,'companyName',r.company_name);
  end if;
  if r.company_cancelled_auth_user_id is not null and r.company_cancelled_auth_user_id<>new_user_id then raise exception 'RECOVERY_CONFLICT'; end if;
  if not exists(select 1 from auth.users u where u.id=new_user_id and u.email=new_internal_email and u.raw_app_meta_data->>'registration_request_id'=request_id::text)
    or exists(select 1 from public.user_profiles where user_id=new_user_id)
    or exists(select 1 from public.server_login_lookup where user_id=new_user_id)
    or exists(select 1 from public.participants where auth_user_id=new_user_id) then raise exception 'RECOVERY_CONFLICT'; end if;
  update public.participant_registration_requests set company_cancelled_auth_user_id=new_user_id where id=request_id;
  return pg_catalog.jsonb_build_object('outcome','cancelled');
end $$;
revoke all on function public.secondcareer_complete_company_registration(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.secondcareer_recover_company_registration(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.secondcareer_complete_company_registration(uuid,uuid,text) to service_role;
grant execute on function public.secondcareer_recover_company_registration(uuid,uuid,text) to service_role;
-- Review existing service grants, RLS, other triggers and Auth hooks before applying.
-- No deployed baseline RPC is replaced; no participant/auth data is migrated here.
commit;
