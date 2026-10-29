-- READ ONLY: review metadata, not application rows or private function bodies.
-- This file is not a migration and has NOT been run against a project.
begin read only;
set local statement_timeout = '15s';

select table_schema,table_name,column_name,udt_name,is_nullable,column_default
from information_schema.columns
where (table_schema='public' and table_name in
  ('organizations','user_profiles','server_login_lookup','participants','assessments','assessment_history','participant_registration_requests'))
  or (table_schema='auth' and table_name='users' and column_name in ('id','raw_app_meta_data'))
order by table_schema,table_name,ordinal_position;

select n.nspname as schema_name,c.relname as table_name,c.relrowsecurity as rls_enabled,
  con.conname,con.contype,pg_catalog.pg_get_constraintdef(con.oid) as definition
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
left join pg_catalog.pg_constraint con on con.conrelid=c.oid
where n.nspname='public' and c.relname in
  ('organizations','user_profiles','server_login_lookup','participants','assessments','assessment_history','participant_registration_requests')
order by c.relname,con.conname;

select schemaname,tablename,indexname,indexdef from pg_catalog.pg_indexes
where schemaname='public' and tablename in
  ('organizations','user_profiles','server_login_lookup','participants','participant_registration_requests')
order by tablename,indexname;

select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_catalog.pg_policies where schemaname='public'
  and tablename in ('user_profiles','server_login_lookup','participants','assessments','assessment_history','participant_registration_requests')
order by tablename,policyname;

select table_schema,table_name,grantee,privilege_type from information_schema.table_privileges
where table_schema='public' and grantee in ('anon','authenticated','service_role','PUBLIC')
  and table_name in ('organizations','user_profiles','server_login_lookup','participants','assessments','assessment_history','participant_registration_requests')
order by table_name,grantee,privilege_type;

-- Column-level grants also matter; table grants alone do not show them.
select table_schema,table_name,column_name,grantee,privilege_type from information_schema.column_privileges
where table_schema='public' and grantee in ('anon','authenticated','service_role','PUBLIC')
  and table_name in ('user_profiles','server_login_lookup','participants','assessments','assessment_history')
order by table_name,column_name,grantee,privilege_type;

select n.nspname as schema_name,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  pg_catalog.pg_get_function_result(p.oid) as result,p.prosecdef as security_definer,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,p.proacl
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname like 'secondcareer_%')
  or n.nspname='secondcareer_registration_private'
order by n.nspname,p.proname,arguments;

select n.nspname as schema_name,c.relname as table_name,t.tgname,
  pg_catalog.pg_get_triggerdef(t.oid) as definition
from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and ((n.nspname='public' and c.relname in
  ('user_profiles','server_login_lookup','participants','assessments','assessment_history'))
  or (n.nspname='auth' and c.relname='users'))
order by n.nspname,c.relname,t.tgname;

rollback;
