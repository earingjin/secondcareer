-- STEP 14-B2: REVIEW ONLY / NOT APPLIED. No production SQL or migration history.
-- Requires reviewed STEP 14-A + 14-B1 schemas. Inspect actual types, constraints,
-- grants and triggers in a disposable database before approval/application.
-- No participant, assessment, Auth or report records are changed/backfilled.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_catalog.pg_advisory_xact_lock(714002);
do $$
declare required record;
begin
  if pg_catalog.to_regclass('public.client_company_counselors') is not null then
    raise exception 'SCHEMA_REVIEW_REQUIRED: relationship table already exists; do not overwrite';
  end if;
  for required in select * from (values
    ('client_companies','organization_id','uuid'),('client_companies','id','uuid'),
    ('user_profiles','organization_id','uuid'),('user_profiles','user_id','uuid'),('user_profiles','role','text')
  ) as cols(table_name,column_name,type_name) loop
    if not exists(select 1 from pg_catalog.pg_attribute a
      where a.attrelid=pg_catalog.to_regclass('public.'||required.table_name) and a.attname=required.column_name
        and a.atttypid=pg_catalog.to_regtype(required.type_name) and not a.attisdropped) then
      raise exception 'SCHEMA_REVIEW_REQUIRED: %.% type mismatch',required.table_name,required.column_name;
    end if;
  end loop;
  -- Reuse the validated STEP 14-B1 composite company key; never remove constraints.
  if not exists(select 1 from pg_catalog.pg_constraint c
    where c.conrelid='public.client_companies'::regclass and c.contype in ('u','p') and not c.condeferrable and c.convalidated
      and c.conkey=array[
        (select attnum from pg_catalog.pg_attribute where attrelid=c.conrelid and attname='organization_id'),
        (select attnum from pg_catalog.pg_attribute where attrelid=c.conrelid and attname='id')
      ]::smallint[]) then raise exception 'SCHEMA_REVIEW_REQUIRED: missing organization/company unique key'; end if;
  -- Fresh-install additive constraint: fail closed on a name collision.
  if exists(select 1 from pg_catalog.pg_constraint where conrelid='public.user_profiles'::regclass
    and conname='user_profiles_org_user_role_unique') then
    raise exception 'SCHEMA_REVIEW_REQUIRED: profile key already exists; review before reuse';
  end if;
end $$;
-- Including role in the FK also prevents a linked profile being moved to another
-- organization or changed to a non-counselor without first resolving assignments.
-- Do not auto-delete relations on role/organization change or remove existing FKs.
alter table public.user_profiles add constraint user_profiles_org_user_role_unique unique(organization_id,user_id,role);
create table public.client_company_counselors (
  organization_id uuid not null,
  company_id uuid not null,
  counselor_user_id uuid not null,
  counselor_role text generated always as ('counselor'::text) stored not null,
  created_at timestamptz not null default now(),
  primary key(organization_id,company_id,counselor_user_id),
  constraint company_counselors_company_fk foreign key(organization_id,company_id)
    references public.client_companies(organization_id,id) on update restrict on delete restrict,
  constraint company_counselors_profile_fk foreign key(organization_id,counselor_user_id,counselor_role)
    references public.user_profiles(organization_id,user_id,role) on update restrict on delete restrict
);
-- PK covers organization/company reads. Reverse FK index covers counselor checks.
create index company_counselors_org_counselor_idx on public.client_company_counselors(organization_id,counselor_user_id,counselor_role);
alter table public.client_company_counselors enable row level security;
revoke all on public.client_company_counselors from public,anon,authenticated,service_role;
grant select,delete on public.client_company_counselors to service_role;
grant insert(organization_id,company_id,counselor_user_id) on public.client_company_counselors to service_role;
-- No client policy, UPDATE, TRUNCATE, cascade, account or participant mutation.
-- Service-role bypass requires explicit server admin + organization checks.
-- Duplicate assignment: PK -> 23505. Concurrent role/org changes: FK -> 23503.
-- Reapplication/collision aborts. Any failure rolls back the entire installation.
-- Rollback after committed installation requires separate review/export; never drop data.
commit;
