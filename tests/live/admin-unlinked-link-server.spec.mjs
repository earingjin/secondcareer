import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
test('review SQL keeps existing link guards and restricts the new RPC and audit table',()=>{
  const sql=readFileSync('supabase/proposals/admin-unlinked-link.sql','utf8');
  for(const required of ['participants_company_org_fk','participants_org_company_idx','participants_company_link_guard','unique(participant_id)','request_id uuid not null unique','enable row level security','grant select,insert on public.participant_company_link_events to service_role','security invoker set search_path','company_id is null','grant execute on function public.secondcareer_link_unlinked_participant'])expect(sql.toLowerCase()).toContain(required.toLowerCase());
  expect(sql).not.toMatch(/alter table public\.participants (drop|disable)|drop trigger participants_company_link_guard/i);
});
