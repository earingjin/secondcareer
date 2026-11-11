-- READ ONLY REVIEW. Run only after approving read access and the link schema.
-- No UPDATE/INSERT, names/contacts/participant identifiers are not returned.
begin read only;
set local statement_timeout='30s';
with normalized as (
  select organization_id, company_id,
    translate(btrim(regexp_replace(coalesce(company_name,''),'[[:space:]]+',' ','g')),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz') as name_key
  from public.participants
), candidates as (
  select p.organization_id,p.name_key,count(*) as participants,
    (select count(*) from public.client_companies c where c.organization_id=p.organization_id and c.name_key=p.name_key) as matches,
    (select count(*) from public.client_companies c where c.organization_id=p.organization_id and c.name_key=p.name_key and c.status='active') as active_matches,
    (select min(c.id::text) from public.client_companies c where c.organization_id=p.organization_id and c.name_key=p.name_key) as candidate_id
  from normalized p where p.company_id is null group by p.organization_id,p.name_key
), classified as (
  select *,case when name_key='' then 'blank' when matches=0 then 'unmatched'
    when matches>1 then 'ambiguous' when active_matches=0 then 'inactive_review' else 'candidate_review' end as outcome from candidates
)
select organization_id,outcome,
  case when outcome in ('candidate_review','inactive_review') then candidate_id end as company_id,
  sum(participants) as unlinked_participants,
  (select count(*) from normalized p where p.organization_id=c.organization_id and p.company_id is not null) as organization_linked_total,
  (select count(*) from normalized p where p.organization_id=c.organization_id and p.company_id is null) as organization_unlinked_total
from classified c group by organization_id,outcome,
  case when outcome in ('candidate_review','inactive_review') then candidate_id end
order by organization_id,outcome,company_id;
-- Include linked-only organizations too (the candidate result has no row for them).
select organization_id,
  count(*) filter(where company_id is not null) as linked_participants,
  count(*) filter(where company_id is null) as unlinked_participants
from public.participants group by organization_id order by organization_id;
rollback;
-- Candidate-only approval report. No automatic assignment, even for one exact match.
-- Existing uniqueness normally rules out ambiguity; report it defensively.
-- name_key follows STEP 14-A ASCII case folding + POSIX whitespace exactly.
