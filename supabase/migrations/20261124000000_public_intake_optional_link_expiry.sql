begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.public_intake_links in access exclusive mode;

do $migration$
declare
  intake_rpc regprocedure := to_regprocedure(
    'public.secondcareer_public_intake_v1(text,uuid,uuid,text,uuid,text,bigint,jsonb,jsonb)'
  );
  definition text;
begin
  if (
    select count(*) from pg_attribute
    where attrelid in ('public.public_intake_links'::regclass, 'public.public_intakes'::regclass)
      and attname = 'expires_at' and attnotnull and not attisdropped
      and atttypid = 'timestamptz'::regtype
  ) <> 2 then
    raise exception 'Unexpected public intake expiry columns';
  end if;

  -- Match the previously applied function body before changing its two expiry expressions.
  if not exists (
    select 1 from pg_proc
    where oid = intake_rpc and prorettype = 'jsonb'::regtype and not prosecdef
      and cardinality(proconfig) = 1 and replace(proconfig[1], '"', '') = 'search_path='
      and md5(replace(prosrc, E'\r\n', E'\n')) = 'd1efda7a779f9c1cec7eec69ddcdc462'
  ) then
    raise exception 'Unexpected secondcareer_public_intake_v1 definition';
  end if;

  alter table public.public_intake_links alter column expires_at drop not null;

  -- CREATE OR REPLACE retains the function identity, ownership and grants.
  definition := pg_get_functiondef(intake_rpc);
  execute replace(replace(definition,
    'where id=p_link and enabled and expires_at>ts for share;',
    'where id=p_link and enabled and (expires_at is null or expires_at>ts) for share;'),
    'least(l.expires_at,ts+interval ''7 days'')',
    'case when l.expires_at is null then ts+interval ''7 days'' else least(l.expires_at,ts+interval ''7 days'') end');
end;
$migration$;

commit;
