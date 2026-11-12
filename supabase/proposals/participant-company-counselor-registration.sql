-- REVIEW ONLY / NOT APPLIED. Apply only after actual catalog, grants and
-- installed function definitions have been reviewed and explicitly approved.
-- Supplemental to participant-company-link.sql + client-company-counselors.sql.
-- No table creation, participant migration or existing assignment deletion.
-- User-supplied readonly inventory (2026-11-12), NOT substituted below:
-- complete MD5: eaedb5e9ca427815dd4c13a34050e358
-- recovery MD5: a5cfe90880d927b60072682ffe66a15f
-- Full installed bodies were not supplied. Keep placeholders until their
-- behavior, argument names, settings, ownership and ACLs are compared.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin
  raise exception 'SCHEMA_REVIEW_REQUIRED: review installed RPC bodies, relationship constraints and lock privileges before removing this stop';
end $$;
do $$
declare installed record;
begin
  if pg_catalog.to_regclass('public.client_company_counselors') is null
    or pg_catalog.to_regprocedure('public.secondcareer_complete_company_registration(uuid,uuid,text)') is null
    or pg_catalog.to_regprocedure('public.secondcareer_recover_company_registration(uuid,uuid,text)') is null then
    raise exception 'SCHEMA_REVIEW_REQUIRED: existing B1/B2 contracts required';
  end if;
  for installed in select p.* from pg_catalog.pg_proc p
    where p.oid in (
      'public.secondcareer_complete_company_registration(uuid,uuid,text)'::regprocedure,
      'public.secondcareer_recover_company_registration(uuid,uuid,text)'::regprocedure
    ) loop
    if installed.prorettype <> 'jsonb'::regtype or installed.prosecdef then
      raise exception 'SCHEMA_REVIEW_REQUIRED: existing RPC must return jsonb and be SECURITY INVOKER';
    end if;
  end loop;
  if pg_catalog.to_regprocedure('secondcareer_company_private.auth_matches(uuid,text,uuid,boolean)') is null then
    raise exception 'SCHEMA_REVIEW_REQUIRED: existing Auth validation helper required';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p
    where p.oid='secondcareer_company_private.auth_matches(uuid,text,uuid,boolean)'::regprocedure
      and p.prorettype='boolean'::regtype and p.prosecdef
      and pg_catalog.pg_get_userbyid(p.proowner)='postgres')
    or not pg_catalog.has_schema_privilege('service_role','secondcareer_company_private','USAGE')
    or not pg_catalog.has_function_privilege('service_role','secondcareer_company_private.auth_matches(uuid,text,uuid,boolean)','EXECUTE')
    or pg_catalog.has_function_privilege('anon','secondcareer_company_private.auth_matches(uuid,text,uuid,boolean)','EXECUTE')
    or pg_catalog.has_function_privilege('authenticated','secondcareer_company_private.auth_matches(uuid,text,uuid,boolean)','EXECUTE') then
    raise exception 'SCHEMA_REVIEW_REQUIRED: Auth helper contract/permissions differ';
  end if;
  -- Also compare the helper's reviewed empty search_path and full body manually.
  -- Never replace it, add Auth-table grants, or create a new definer helper here.
  if pg_catalog.md5(pg_catalog.pg_get_functiondef('public.secondcareer_complete_company_registration(uuid,uuid,text)'::regprocedure)) <> '__REVIEW_COMPLETE_FUNCTION_MD5__'
    or pg_catalog.md5(pg_catalog.pg_get_functiondef('public.secondcareer_recover_company_registration(uuid,uuid,text)'::regprocedure)) <> '__REVIEW_RECOVERY_FUNCTION_MD5__' then
    raise exception 'SCHEMA_REVIEW_REQUIRED: installed RPC differs from reviewed definition';
  end if;
end $$;
-- SELECT ... FOR SHARE requires UPDATE privilege on at least one column.
-- Existing B2 proposal grants SELECT/DELETE/INSERT only. Review and approve
-- this service-only column grant; never grant it to anon/authenticated.
grant update(counselor_user_id) on public.client_company_counselors to service_role;

create or replace function public.secondcareer_complete_company_registration(request_id uuid,new_user_id uuid,new_internal_email text)
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
  -- Serializes completion with DELETE/unassign without binding old participants
  -- to a relation that may legitimately be removed after registration.
  perform 1 from public.client_company_counselors a
    where a.organization_id=r.organization_id and a.company_id=r.company_id
      and a.counselor_user_id=r.counselor_user_id for share;
  if not found then raise exception 'COUNSELOR_NOT_ASSIGNED'; end if;
  if secondcareer_company_private.auth_matches(new_user_id,new_internal_email,request_id,true) is not true then
    raise exception 'AUTH_MISMATCH';
  end if;
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
create or replace function public.secondcareer_recover_company_registration(request_id uuid,new_user_id uuid,new_internal_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.participant_registration_requests%rowtype;
begin
  select * into strict r from public.participant_registration_requests where id=request_id for update;
  if r.company_id is null then raise exception 'COMPANY_LINK_REQUIRED'; end if;
  -- Verify Auth identity for BOTH committed and pending recovery. false allows
  -- recovery after the user's first password change without weakening identity.
  if secondcareer_company_private.auth_matches(new_user_id,new_internal_email,request_id,false) is not true then
    raise exception 'RECOVERY_CONFLICT';
  end if;
  -- A committed registration remains valid after a later unassignment.
  -- Never recheck today's assignment to undo yesterday's completed account.
  if r.status='complete' then
    if r.auth_user_id<>new_user_id or not exists(select 1 from public.participants p
      where p.id=r.participant_id and p.auth_user_id=new_user_id and p.organization_id=r.organization_id and p.company_id=r.company_id and p.counselor_user_id=r.counselor_user_id) then
      raise exception 'RECOVERY_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('outcome','complete','participantId',r.participant_id,'companyId',r.company_id,'companyName',r.company_name);
  end if;
  if r.company_cancelled_auth_user_id is not null and r.company_cancelled_auth_user_id<>new_user_id then raise exception 'RECOVERY_CONFLICT'; end if;
  if exists(select 1 from public.user_profiles where user_id=new_user_id)
    or exists(select 1 from public.server_login_lookup where user_id=new_user_id)
    or exists(select 1 from public.participants where auth_user_id=new_user_id) then raise exception 'RECOVERY_CONFLICT'; end if;
  update public.participant_registration_requests set company_cancelled_auth_user_id=new_user_id where id=request_id;
  return pg_catalog.jsonb_build_object('outcome','cancelled');
end $$;
revoke all on function public.secondcareer_complete_company_registration(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.secondcareer_recover_company_registration(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.secondcareer_complete_company_registration(uuid,uuid,text) to service_role;
grant execute on function public.secondcareer_recover_company_registration(uuid,uuid,text) to service_role;

commit;
