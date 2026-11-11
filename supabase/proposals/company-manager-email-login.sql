-- 14-C follow-up: customer-company manager email login (additive).
-- Run after company-manager-accounts.sql is applied.
-- Preserve server_login_lookup.login_id and auth.users.email; only the manager-facing login changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $pre$
begin
 if pg_catalog.to_regclass('public.company_manager_accounts') is null
    or pg_catalog.to_regclass('public.company_manager_registration_requests') is null then
   raise exception 'MANAGER_SCHEMA_REQUIRED';
 end if;
 if exists(select 1 from public.company_manager_accounts group by email_key having count(*)>1)
    or exists(select 1 from public.company_manager_registration_requests group by email_key having count(*)>1) then
   raise exception 'DUPLICATE_MANAGER_EMAIL_REVIEW_REQUIRED';
 end if;
 if exists(select 1 from pg_catalog.pg_indexes where schemaname='public'
   and indexname in ('manager_email_global_unique','manager_request_email_global_unique')) then
   raise exception 'MIGRATION_ALREADY_APPLIED';
 end if;
end $pre$;
create unique index manager_email_global_unique on public.company_manager_accounts(email_key);
create unique index manager_request_email_global_unique on public.company_manager_registration_requests(email_key);
commit;
