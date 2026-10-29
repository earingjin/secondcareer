-- REVIEW PROPOSAL ONLY. Not an applied or generated migration.
-- Local repository has no authoritative baseline schema/RLS migrations.
-- Assumes the table/column names used by src/admin/account-operations.cjs.
-- Review types, grants, existing policies and RPCs before generating a migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Abort before DDL when the inferred local contract is not the real schema.
-- These catalog checks do not prove compatibility with the missing login,
-- assessment handler, write RPC, triggers or custom Auth configuration.
do $preflight$
declare
  required record;
  actual_type oid;
begin
  for required in select * from (values
    ('auth','users','id','uuid'), ('auth','users','raw_app_meta_data','jsonb'),
    ('public','organizations','id','uuid'), ('public','organizations','name','text'),
    ('public','user_profiles','user_id','uuid'), ('public','user_profiles','organization_id','uuid'),
    ('public','user_profiles','role','text'), ('public','user_profiles','display_name','text'),
    ('public','server_login_lookup','user_id','uuid'), ('public','server_login_lookup','login_id','text'),
    ('public','server_login_lookup','internal_email','text'),
    ('public','participants','id','uuid'), ('public','participants','organization_id','uuid'),
    ('public','participants','counselor_user_id','uuid'), ('public','participants','auth_user_id','uuid'),
    ('public','participants','display_name','text'), ('public','assessments','participant_id','uuid'),
    ('public','assessment_history','assessment_id','uuid')
  ) as columns(schema_name, table_name, column_name, type_name)
  loop
    select a.atttypid into actual_type from pg_catalog.pg_attribute a
      where a.attrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',required.schema_name,required.table_name))
        and a.attname=required.column_name and not a.attisdropped;
    if actual_type is distinct from pg_catalog.to_regtype(required.type_name)::oid then
      raise exception 'SCHEMA_REVIEW_REQUIRED: %.%.% must be %', required.schema_name,required.table_name,required.column_name,required.type_name;
    end if;
  end loop;
  for required in select * from (values ('phone'),('company_name')) as columns(column_name)
  loop
    if exists(select 1 from pg_catalog.pg_attribute a where a.attrelid='public.participants'::regclass
      and a.attname=required.column_name and not a.attisdropped and a.atttypid<>'text'::regtype) then
      raise exception 'SCHEMA_REVIEW_REQUIRED: participants.% already has another type',required.column_name;
    end if;
  end loop;
  for required in select * from (values
    ('organizations','id'),('user_profiles','user_id'),('server_login_lookup','user_id'),
    ('server_login_lookup','login_id'),('server_login_lookup','internal_email'),
    ('participants','id'),('participants','auth_user_id')
  ) as keys(table_name,column_name)
  loop
    if not exists(select 1 from pg_catalog.pg_index i join pg_catalog.pg_attribute a
      on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
      where i.indrelid=pg_catalog.to_regclass('public.'||required.table_name)
        and a.attname=required.column_name and i.indisunique and i.indisvalid
        and i.indnkeyatts=1 and i.indpred is null and i.indexprs is null) then
      raise exception 'SCHEMA_REVIEW_REQUIRED: %.% requires a standalone unique key',required.table_name,required.column_name;
    end if;
  end loop;
  for required in select * from (values
    ('public.user_profiles','user_id','auth.users','id'),
    ('public.user_profiles','organization_id','public.organizations','id'),
    ('public.server_login_lookup','user_id','auth.users','id'),
    ('public.participants','auth_user_id','auth.users','id'),
    ('public.participants','counselor_user_id','public.user_profiles','user_id'),
    ('public.participants','organization_id','public.organizations','id'),
    ('public.assessments','participant_id','public.participants','id')
  ) as links(source_table,source_column,target_table,target_column)
  loop
    if not exists(select 1 from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute s on s.attrelid=c.conrelid and s.attname=required.source_column
      join pg_catalog.pg_attribute t on t.attrelid=c.confrelid and t.attname=required.target_column
      where c.contype='f' and c.convalidated and c.conrelid=pg_catalog.to_regclass(required.source_table)
        and c.confrelid=pg_catalog.to_regclass(required.target_table)
        and c.conkey=array[s.attnum]::smallint[] and c.confkey=array[t.attnum]::smallint[]) then
      raise exception 'SCHEMA_REVIEW_REQUIRED: missing validated FK %.% -> %.%',required.source_table,required.source_column,required.target_table,required.target_column;
    end if;
  end loop;
  for required in select * from (values
    ('user_profiles',array['user_id','organization_id','role','display_name']::text[]),
    ('server_login_lookup',array['user_id','login_id','internal_email']::text[]),
    ('participants',array['id','organization_id','counselor_user_id','auth_user_id','display_name','phone','company_name']::text[])
  ) as inserts(table_name, supplied_columns)
  loop
    if exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass('public.'||required.table_name)
      and a.attnum>0 and not a.attisdropped and a.attnotnull and not a.atthasdef
      and a.attidentity='' and a.attgenerated='' and not (a.attname=any(required.supplied_columns))) then
      raise exception 'SCHEMA_REVIEW_REQUIRED: % has an additional required column',required.table_name;
    end if;
    if not pg_catalog.has_table_privilege('service_role','public.'||required.table_name,'SELECT')
      or not pg_catalog.has_table_privilege('service_role','public.'||required.table_name,'INSERT') then
      raise exception 'SCHEMA_REVIEW_REQUIRED: review existing service_role grants on %',required.table_name;
    end if;
  end loop;
  for required in select * from (values ('user_profiles'),('participants'),('assessments'),('assessment_history'),('server_login_lookup')) as tables(table_name)
  loop
    if not exists(select 1 from pg_catalog.pg_class c where c.oid=pg_catalog.to_regclass('public.'||required.table_name)
      and c.relkind in ('r','p') and c.relrowsecurity) then
      raise exception 'SCHEMA_REVIEW_REQUIRED: RLS must already be enabled on %',required.table_name;
    end if;
  end loop;
  if pg_catalog.to_regclass('public.participant_registration_requests') is not null
    or pg_catalog.to_regnamespace('secondcareer_registration_private') is not null
    or exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='secondcareer_complete_registration')
    or exists(select 1 from pg_catalog.pg_policies where schemaname='public'
      and (tablename,policyname) in (('participants','participant_password_gate'),('assessments','assessment_password_gate'),('assessment_history','history_password_gate'))) then
    raise exception 'REGISTRATION_OBJECT_CONFLICT: review existing objects; do not replace them automatically';
  end if;
end;
$preflight$;

alter table public.participants add column if not exists phone text;
alter table public.participants add column if not exists company_name text;

create table public.participant_registration_requests (
  id uuid primary key,
  actor_user_id uuid not null references auth.users(id),
  organization_id uuid not null references public.organizations(id),
  counselor_user_id uuid not null references public.user_profiles(user_id),
  login_id text not null unique check (login_id ~ '^[0-9]{8}$'),
  display_name text not null check (char_length(display_name) between 1 and 12),
  phone text not null check (phone ~ '^[0-9]{8,20}$'),
  company_name text not null default '' check (char_length(company_name)<=200),
  status text not null default 'pending' check (status in ('pending','complete')),
  auth_user_id uuid references auth.users(id),
  participant_id uuid references public.participants(id),
  created_at timestamptz not null default now(),
  check (login_id=right(phone,8)),
  check ((status='pending' and auth_user_id is null and participant_id is null)
    or (status='complete' and auth_user_id is not null and participant_id is not null))
);
alter table public.participant_registration_requests enable row level security;
revoke all on public.participant_registration_requests from public, anon, authenticated;
grant select, insert, update on public.participant_registration_requests to service_role;

create function public.secondcareer_complete_registration(request_id uuid, new_user_id uuid, new_internal_email text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  r public.participant_registration_requests%rowtype;
  participant uuid;
begin
  select * into strict r from public.participant_registration_requests where id = request_id for update;
  if r.status <> 'pending' then raise exception 'REQUEST_NOT_PENDING'; end if;
  if not exists (
    select 1 from public.user_profiles a where a.user_id = r.actor_user_id
      and a.organization_id = r.organization_id
      and (a.role = 'admin' or (a.role = 'counselor' and a.user_id = r.counselor_user_id))
  ) or not exists (
    select 1 from public.user_profiles c where c.user_id = r.counselor_user_id
      and c.organization_id = r.organization_id and c.role = 'counselor'
  ) then raise exception 'FORBIDDEN'; end if;
  insert into public.user_profiles(user_id, organization_id, role, display_name)
    values (new_user_id, r.organization_id, 'participant', r.display_name);
  insert into public.server_login_lookup(user_id, login_id, internal_email)
    values (new_user_id, r.login_id, new_internal_email);
  insert into public.participants(id, organization_id, counselor_user_id, auth_user_id, display_name, phone, company_name)
    values (pg_catalog.gen_random_uuid(), r.organization_id, r.counselor_user_id, new_user_id, r.display_name, r.phone, r.company_name)
    returning id into participant;
  update public.participant_registration_requests set status='complete', auth_user_id=new_user_id, participant_id=participant where id=request_id;
  return participant;
end;
$$;
revoke all on function public.secondcareer_complete_registration(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.secondcareer_complete_registration(uuid,uuid,text) to service_role;

-- Restrictive policies ADD a password gate to existing ownership/role policies;
-- they do not grant new access. Edge service-role queries still need the guard.
-- Own namespace: never revoke permissions on an existing shared private schema.
create schema secondcareer_registration_private;
revoke all on schema secondcareer_registration_private from public, anon;
grant usage on schema secondcareer_registration_private to authenticated;
create function secondcareer_registration_private.password_ready()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u where u.id = (select auth.uid())
    and pg_catalog.jsonb_typeof(u.raw_app_meta_data)='object'
    and ((u.raw_app_meta_data->'must_change_password')='false'::jsonb
      or (not (u.raw_app_meta_data ? 'must_change_password') and not (u.raw_app_meta_data ? 'registration_request_id'))));
$$;
revoke all on function secondcareer_registration_private.password_ready() from public, anon;
grant execute on function secondcareer_registration_private.password_ready() to authenticated;
create policy participant_password_gate on public.participants as restrictive for all to authenticated
  using ((select secondcareer_registration_private.password_ready())) with check ((select secondcareer_registration_private.password_ready()));
create policy assessment_password_gate on public.assessments as restrictive for all to authenticated
  using ((select secondcareer_registration_private.password_ready())) with check ((select secondcareer_registration_private.password_ready()));
create policy history_password_gate on public.assessment_history as restrictive for all to authenticated
  using ((select secondcareer_registration_private.password_ready())) with check ((select secondcareer_registration_private.password_ready()));
commit;
