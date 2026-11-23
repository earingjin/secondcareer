begin read only;
select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where (table_schema='public' and table_name in ('participants','client_companies','user_profiles','participant_assignment_events'))
   or (table_schema='auth' and table_name='users' and column_name in ('id','deleted_at','banned_until'));

select conrelid::regclass, conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.participants'::regclass,'public.client_companies'::regclass,'public.user_profiles'::regclass);

select tgrelid::regclass, tgname, pg_get_triggerdef(oid), pg_get_functiondef(tgfoid)
from pg_trigger
where not tgisinternal and tgrelid in ('public.participants'::regclass,'public.client_companies'::regclass,'public.user_profiles'::regclass);

select * from pg_policies
where schemaname='public' and tablename in ('participants','client_companies','user_profiles','participant_assignment_events');

select p.oid::regprocedure, p.proacl, p.prosecdef, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('secondcareer_link_unlinked_participant','secondcareer_assign_participant_v1','secondcareer_write_v1');
rollback;
