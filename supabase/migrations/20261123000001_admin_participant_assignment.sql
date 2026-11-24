begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.participant_assignment_events (
  request_id uuid primary key,
  organization_id uuid not null,
  participant_id uuid not null,
  actor_id uuid not null,
  kind text not null check (kind in ('company','counselor')),
  before_company_id uuid,
  after_company_id uuid,
  before_counselor_id uuid,
  after_counselor_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.participant_assignment_events enable row level security;
revoke all on public.participant_assignment_events from public, anon, authenticated, service_role;

-- Definer is needed only because the target's Auth account status is private.
-- Browser roles cannot execute this function. The actor and tenant are rechecked here.
create function public.secondcareer_assign_participant_v1(
  p_actor uuid, p_org uuid, p_participant uuid, p_kind text, p_target uuid,
  p_expected uuid, p_request uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  participant public.participants%rowtype;
  receipt public.participant_assignment_events%rowtype;
begin
  if p_kind is null or p_kind not in ('company','counselor') or p_request is null then
    raise exception 'Invalid operation' using errcode='22023';
  end if;
  perform 1 from public.user_profiles where user_id=p_actor and organization_id=p_org and role='admin' for share;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into participant from public.participants where id=p_participant and organization_id=p_org for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;

  select * into receipt from public.participant_assignment_events where request_id=p_request;
  if found then
    if receipt.organization_id=p_org and receipt.actor_id=p_actor and receipt.participant_id=p_participant
      and receipt.kind=p_kind
      and (case when p_kind='company' then receipt.before_company_id else receipt.before_counselor_id end) is not distinct from p_expected
      and (case when p_kind='company' then receipt.after_company_id else receipt.after_counselor_id end) is not distinct from p_target then
      return jsonb_build_object('requestId',p_request);
    end if;
    raise exception 'Request conflict' using errcode='40001';
  end if;

  if p_kind='company' then
    if participant.company_id is distinct from p_expected then raise exception 'Stale company' using errcode='40001'; end if;
    if p_target is not null then
      perform 1 from public.client_companies where id=p_target and organization_id=p_org and status='active' for share;
      if not found then raise exception 'Company unavailable' using errcode='22023'; end if;
    end if;
    update public.participants set company_id=p_target where id=p_participant and company_id is distinct from p_target;
  else
    if participant.counselor_user_id is distinct from p_expected then raise exception 'Stale counselor' using errcode='40001'; end if;
    if p_target is not null then
      perform 1 from public.user_profiles profile join auth.users account on account.id=profile.user_id
        where profile.user_id=p_target and profile.organization_id=p_org and profile.role='counselor'
          and account.deleted_at is null and (account.banned_until is null or account.banned_until<=clock_timestamp())
        for share of profile,account;
      if not found then raise exception 'Counselor unavailable' using errcode='22023'; end if;
    end if;
    update public.participants set counselor_user_id=p_target where id=p_participant and counselor_user_id is distinct from p_target;
  end if;
  insert into public.participant_assignment_events values (
    p_request,p_org,p_participant,p_actor,p_kind,participant.company_id,
    case when p_kind='company' then p_target else participant.company_id end,
    participant.counselor_user_id,case when p_kind='counselor' then p_target else participant.counselor_user_id end,
    clock_timestamp()
  );
  return jsonb_build_object('requestId',p_request);
end;
$$;
revoke all on function public.secondcareer_assign_participant_v1(uuid,uuid,uuid,text,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.secondcareer_assign_participant_v1(uuid,uuid,uuid,text,uuid,uuid,uuid) to service_role;
commit;
