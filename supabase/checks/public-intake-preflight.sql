-- READ ONLY. Review complete output against the target DB; no credentials or row data.
begin read only;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name in ('organizations','participants','assessments') order by table_name,ordinal_position;
select conrelid::regclass as relation,conname,contype,pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in ('public.participants'::regclass,'public.assessments'::regclass);
select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('participants','assessments');
select c.oid::regclass,c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.oid in ('public.participants'::regclass,'public.assessments'::regclass);
select * from pg_policies where schemaname='public' and tablename in ('participants','assessments');
select tgrelid::regclass,tgname,pg_get_triggerdef(oid),pg_get_functiondef(tgfoid) from pg_trigger
where tgrelid in ('public.participants'::regclass,'public.assessments'::regclass) and not tgisinternal;
select p.oid::regprocedure,p.prosecdef,p.proacl,pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname like 'secondcareer%';
select * from information_schema.role_table_grants where table_schema='public' and table_name in ('participants','assessments');
rollback;
