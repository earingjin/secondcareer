-- STEP 14-A: REVIEW ONLY / NOT APPLIED. Supabase CLI is not installed in this workspace.
-- Run only after separate approval, schema review and backup in a disposable DB first.
-- Transactional fresh-install proposal. Reapplying or finding an existing table/function
-- fails BEFORE DDL; do not silently adopt an unrelated object via IF NOT EXISTS.
-- On failure: ROLLBACK the transaction; no existing table/data is changed.
-- After a committed installation, rollback/removal requires a separate reviewed migration
-- and export of newly registered master rows. Never cascade-drop operational data.
begin;
select pg_catalog.pg_advisory_xact_lock(714014001);
do $review$
begin
  if pg_catalog.to_regclass('public.client_companies') is not null
     or pg_catalog.to_regprocedure('public.prepare_client_company()') is not null then
    raise exception 'SCHEMA_REVIEW_REQUIRED: client company objects already exist; stop rather than overwrite';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
      where attrelid=pg_catalog.to_regclass('public.organizations') and attname='id'
        and atttypid='uuid'::regtype and not attisdropped) then
    raise exception 'SCHEMA_REVIEW_REQUIRED: organizations.id uuid is required';
  end if;
end
$review$;

create table public.client_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  -- Only English case is folded; no transliteration, punctuation removal or fuzzy match.
  name_key text generated always as (translate(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')) stored,
  start_date date not null,
  end_date date not null,
  pm_name text not null,
  pm_email text not null,
  pm_phone text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_companies_name_valid check (char_length(name) between 1 and 200 and name=btrim(name) and name !~ '[[:cntrl:]]' and char_length(name_key)>0),
  constraint client_companies_dates_valid check (start_date >= date '0001-01-01' and end_date <= date '9999-12-31' and end_date >= start_date),
  constraint client_companies_pm_name_valid check (char_length(btrim(pm_name)) between 1 and 100 and pm_name !~ '[[:cntrl:]]'),
  constraint client_companies_pm_email_valid check (char_length(pm_email) <= 254 and pm_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint client_companies_pm_phone_valid check (char_length(pm_phone) <= 30 and pm_phone ~ '^[+0-9() .-]+$' and char_length(regexp_replace(pm_phone, '[^0-9]', '', 'g')) between 7 and 20),
  constraint client_companies_org_name_unique unique (organization_id, name_key)
);
create index client_companies_org_status_name on public.client_companies (organization_id, status, name_key);
create index client_companies_org_created on public.client_companies (organization_id, created_at desc, id desc);

create function public.prepare_client_company() returns trigger
language plpgsql security invoker set search_path = '' as $body$
begin
  new.name := btrim(regexp_replace(new.name, '[[:space:]]+', ' ', 'g'));
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.organization_id is distinct from old.organization_id
       or new.created_at is distinct from old.created_at then
      raise exception 'IMMUTABLE_CLIENT_COMPANY_SCOPE';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end
$body$;
revoke all on function public.prepare_client_company() from public, anon, authenticated;
create trigger client_companies_prepare before insert or update on public.client_companies
  for each row execute function public.prepare_client_company();

alter table public.client_companies enable row level security;
-- Deliberate default deny: no anon/authenticated policies, and no table/column grants.
-- service_role bypasses RLS; every API query MUST additionally constrain organization_id.
revoke all on table public.client_companies from public, anon, authenticated, service_role;
grant select on table public.client_companies to service_role;
grant insert (organization_id, name, start_date, end_date, pm_name, pm_email, pm_phone)
  on table public.client_companies to service_role;
grant update (name, start_date, end_date, pm_name, pm_email, pm_phone, status)
  on table public.client_companies to service_role;
-- No DELETE/TRUNCATE, no Auth/profile/participant/assessment/Storage changes.
commit;
