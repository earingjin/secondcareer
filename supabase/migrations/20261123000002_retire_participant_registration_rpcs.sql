begin;
-- These routines have no remaining Edge callers. Keep their definitions and data.
do $$
declare
  signature text;
  routine regprocedure;
begin
  foreach signature in array array[
    'public.secondcareer_complete_registration(uuid,uuid,text)',
    'public.secondcareer_complete_company_registration(uuid,uuid,text)',
    'public.secondcareer_recover_company_registration(uuid,uuid,text)',
    'public.secondcareer_link_unlinked_participant(uuid,uuid,uuid,uuid,uuid)'
  ] loop
    routine := to_regprocedure(signature);
    if routine is not null then
      execute format('revoke execute on function %s from public, anon, authenticated, service_role', routine);
    end if;
  end loop;
  -- The shared assessment RPC still serves counselor edits through the Edge function.
  for routine in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='secondcareer_write_v1' and p.prokind='f'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', routine);
    execute format('grant execute on function %s to service_role', routine);
  end loop;
end;
$$;
commit;
