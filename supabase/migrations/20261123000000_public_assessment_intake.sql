-- Run checks/public-intake-preflight.sql and review its output before applying.
-- No existing rows are updated/deleted. Any incompatible constraint aborts submission atomically.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
alter table public.participants alter column auth_user_id drop not null;
alter table public.participants alter column counselor_user_id drop not null;
alter table public.participants alter column company_id drop not null;

create table public.public_intake_links (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 enabled boolean not null default false,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create table public.public_intakes (
 id uuid primary key,
 link_id uuid not null references public.public_intake_links(id),
 token_hash text not null check(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null,
 status text not null default 'draft' check(status in ('draft','submitted')),
 version bigint not null default 0 check(version>=0),
 answers jsonb,
 participant_id uuid unique references public.participants(id),
 submitted_at timestamptz,
 check ((status='draft' and participant_id is null and submitted_at is null) or
        (status='submitted' and participant_id is not null and submitted_at is not null))
);
create table public.public_intake_requests (
 intake_id uuid not null references public.public_intakes(id),
 request_id uuid not null,
 fingerprint text not null,
 primary key(intake_id,request_id)
);
create index public_intakes_link_idx on public.public_intakes(link_id);
create table public.public_intake_limits (
 link_id uuid not null references public.public_intake_links(id),
 bucket timestamptz not null,
 kind text not null check(kind in ('all','start')),
 hits integer not null,
 primary key(link_id,bucket,kind)
);
alter table public.public_intake_links enable row level security;
alter table public.public_intakes enable row level security;
alter table public.public_intake_requests enable row level security;
alter table public.public_intake_limits enable row level security;
revoke all on public.public_intake_links,public.public_intakes,public.public_intake_requests,public.public_intake_limits from public,anon,authenticated;
grant select,insert,update on public.public_intake_links,public.public_intakes,public.public_intake_requests,public.public_intake_limits to service_role;

create function public.secondcareer_public_intake_v1(
 p_action text,p_link uuid,p_id uuid,p_hash text,p_request uuid,p_fingerprint text,
 p_version bigint,p_answers jsonb,p_result jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 l public.public_intake_links%rowtype;
 r public.public_intakes%rowtype;
 old_fingerprint text;
 hits_now integer;
 ts timestamptz:=clock_timestamp();
 new_part uuid;
begin
 if p_action not in ('start','read','draft','submit','status') or p_action is null or
 p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_id is null then
  return jsonb_build_object('error','NOT_FOUND');
 end if;
 select * into l from public.public_intake_links where id=p_link and enabled and expires_at>ts for share;
 if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
 -- Shared, durable quota across Edge instances. No spoofable client IP/header is trusted.
 insert into public.public_intake_limits values(p_link,date_trunc('minute',ts),'all',1)
 on conflict(link_id,bucket,kind) do update set hits=public.public_intake_limits.hits+1 returning hits into hits_now;
 if hits_now>600 then return jsonb_build_object('error','RATE_LIMITED'); end if;
 if p_action='start' then
  insert into public.public_intake_limits values(p_link,date_trunc('hour',ts),'start',1)
  on conflict(link_id,bucket,kind) do update set hits=public.public_intake_limits.hits+1 returning hits into hits_now;
  if hits_now>30 then return jsonb_build_object('error','RATE_LIMITED'); end if;
 end if;
 -- Preserve quota even if the data operation fails; inner block rolls back all data mutations.
 begin
  if p_action in ('start','draft','submit') and (p_request is null or p_fingerprint is null) then
   return jsonb_build_object('error','CONFLICT');
  end if;
  if p_action='start' then
   insert into public.public_intakes(id,link_id,token_hash,expires_at)
    values(p_id,p_link,p_hash,least(l.expires_at,ts+interval '7 days')) on conflict(id) do nothing;
  end if;
  select * into r from public.public_intakes where id=p_id and link_id=p_link and token_hash=p_hash and expires_at>ts for update;
  if not found then return jsonb_build_object('error','NOT_FOUND'); end if;
  if p_action in ('start','draft','submit') then
   select fingerprint into old_fingerprint from public.public_intake_requests where intake_id=p_id and request_id=p_request;
   if found then
    if old_fingerprint<>p_fingerprint then return jsonb_build_object('error','REQUEST_REUSED'); end if;
    -- Exact retry returns current state without recomputing or replacing the saved result.
   else
    if p_action in ('draft','submit') then
     if r.status='submitted' then return jsonb_build_object('error','LOCKED'); end if;
     if p_version is null or p_version<>r.version then return jsonb_build_object('error','CONFLICT'); end if;
     if p_answers is null or jsonb_typeof(p_answers)<>'object' then raise exception 'invalid answers'; end if;
     if p_action='submit' then
      if p_result is null or jsonb_typeof(p_result)<>'object' then raise exception 'missing server calculation'; end if;
      new_part:=gen_random_uuid();
      insert into public.participants(id,organization_id,auth_user_id,counselor_user_id,company_id,display_name,phone,company_name)
       values(new_part,l.organization_id,null,null,null,p_answers#>>'{reg,name}',p_answers#>>'{reg,phone}',p_answers#>>'{reg,careers,0,co}');
      insert into public.assessments(participant_id,phase,status,answers,result,updated_at,submitted_at,schema_version)
       values(new_part,'pre','submitted',p_answers,p_result,ts,ts,'sp-assessment-1');
     end if;
     update public.public_intakes set answers=case when p_action='submit' then null else p_answers end,
      status=case when p_action='submit' then 'submitted' else 'draft' end,
      version=version+1,participant_id=new_part,submitted_at=case when p_action='submit' then ts else null end
      where id=p_id returning * into r;
    end if;
    insert into public.public_intake_requests values(p_id,p_request,p_fingerprint);
   end if;
  end if;
  return jsonb_build_object('status',r.status,'version',r.version,'expiresAt',r.expires_at,'submittedAt',r.submitted_at,
   'answers',case when p_action='read' and r.status='draft' then r.answers else null end);
 exception when others then
  -- Never return SQL details or PII. PostgreSQL rolls back participant+assessment+receipt together.
  return jsonb_build_object('error','STORAGE_UNAVAILABLE');
 end;
end;
$$;
revoke all on function public.secondcareer_public_intake_v1(text,uuid,uuid,text,uuid,text,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.secondcareer_public_intake_v1(text,uuid,uuid,text,uuid,text,bigint,jsonb,jsonb) to service_role;
commit;
