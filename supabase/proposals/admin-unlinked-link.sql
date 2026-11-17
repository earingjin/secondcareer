-- REVIEW ONLY. Do not run against production without schema/ACL review and approval.
begin;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='participants_company_org_fk')
    or not exists(select 1 from pg_indexes where schemaname='public' and indexname='participants_org_company_idx')
    or not exists(select 1 from pg_trigger where tgname='participants_company_link_guard' and not tgisinternal)
    or to_regclass('public.client_company_counselors') is null
    or to_regclass('public.participant_company_link_events') is not null
    or to_regprocedure('public.secondcareer_link_unlinked_participant(uuid,uuid,uuid,uuid,uuid)') is not null
  then raise exception 'SCHEMA_REVIEW_REQUIRED'; end if;
end $$;

create table public.participant_company_link_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  participant_id uuid not null references public.participants(id) on delete restrict,
  old_company_id uuid null check (old_company_id is null),
  new_company_id uuid not null,
  actor_admin_user_id uuid not null references public.user_profiles(user_id) on delete restrict,
  request_id uuid not null unique,
  linked_at timestamptz not null default now(),
  constraint participant_company_link_once unique(participant_id),
  constraint participant_company_link_target_fk foreign key(organization_id,new_company_id)
    references public.client_companies(organization_id,id) on delete restrict
);
create index participant_company_link_events_org_idx on public.participant_company_link_events(organization_id,linked_at);
alter table public.participant_company_link_events enable row level security;
revoke all on public.participant_company_link_events from public,anon,authenticated;
grant select,insert on public.participant_company_link_events to service_role;

create function public.secondcareer_link_unlinked_participant(
  actor_id uuid, actor_org uuid, target_participant_id uuid, target_company_id uuid, operation_id uuid
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  p public.participants%rowtype;
  c public.client_companies%rowtype;
  e public.participant_company_link_events%rowtype;
begin
  if not exists(select 1 from public.user_profiles u where u.user_id=actor_id and u.organization_id=actor_org and u.role='admin') then
    raise exception 'FORBIDDEN';
  end if;
  select * into e from public.participant_company_link_events where request_id=operation_id;
  if found then
    if e.organization_id<>actor_org or e.participant_id<>target_participant_id or e.new_company_id<>target_company_id or e.actor_admin_user_id<>actor_id then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('outcome','already_completed','participantId',e.participant_id,'companyId',e.new_company_id,'linkedAt',e.linked_at,'requestId',e.request_id);
  end if;
  select * into p from public.participants where id=target_participant_id and organization_id=actor_org for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  -- A concurrent request with the same ID may have finished while the row lock was pending.
  select * into e from public.participant_company_link_events where request_id=operation_id;
  if found then
    if e.organization_id<>actor_org or e.participant_id<>target_participant_id or e.new_company_id<>target_company_id or e.actor_admin_user_id<>actor_id then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return pg_catalog.jsonb_build_object('outcome','already_completed','participantId',e.participant_id,'companyId',e.new_company_id,'linkedAt',e.linked_at,'requestId',e.request_id);
  end if;
  if p.company_id is not null then raise exception 'COMPANY_CONFLICT'; end if;
  select * into c from public.client_companies where id=target_company_id and organization_id=actor_org for share;
  if not found then raise exception 'FORBIDDEN'; end if;
  if c.status<>'active' then raise exception 'COMPANY_INACTIVE'; end if;
  if p.counselor_user_id is null then raise exception 'COUNSELOR_REVIEW_REQUIRED'; end if;
  if not exists(select 1 from public.user_profiles u where u.user_id=p.counselor_user_id and u.organization_id=actor_org and u.role='counselor')
    or not exists(select 1 from public.client_company_counselors a where a.organization_id=actor_org and a.company_id=c.id and a.counselor_user_id=p.counselor_user_id for share) then
    raise exception 'COUNSELOR_REVIEW_REQUIRED';
  end if;
  update public.participants set company_id=c.id where id=p.id and organization_id=actor_org and company_id is null;
  if not found then raise exception 'COMPANY_CONFLICT'; end if;
  insert into public.participant_company_link_events(organization_id,participant_id,old_company_id,new_company_id,actor_admin_user_id,request_id)
    values(actor_org,p.id,null,c.id,actor_id,operation_id) returning * into e;
  return pg_catalog.jsonb_build_object('outcome','linked','participantId',e.participant_id,'companyId',e.new_company_id,'linkedAt',e.linked_at,'requestId',e.request_id);
end $$;
revoke all on function public.secondcareer_link_unlinked_participant(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.secondcareer_link_unlinked_participant(uuid,uuid,uuid,uuid,uuid) to service_role;
commit;
