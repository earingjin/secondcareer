import {test,expect} from '@playwright/test';
import fs from 'node:fs';

test('unapplied SQL is additive, restricts role/org relationships, blocks direct clients and has no participant writes',()=>{
  const sql=fs.readFileSync('supabase/proposals/client-company-counselors.sql','utf8'),code=sql.replace(/--[^\n]*/g,'');
  expect(code).toContain('primary key(organization_id,company_id,counselor_user_id)');expect(code).toContain("generated always as ('counselor'::text) stored");
  expect(code).toContain('foreign key(organization_id,counselor_user_id,counselor_role)');expect(code).toContain('references public.client_companies(organization_id,id)');
  expect(code).toContain('enable row level security');expect(code).toContain('from public,anon,authenticated,service_role');expect(code).toContain('grant select,delete');
  expect(code).not.toMatch(/\b(?:drop|cascade)\b|create or replace|\b(?:update|insert into|delete from) public\.(?:participants|assessments|user_profiles|client_companies)\b/i);
  expect(code).toContain('on update restrict on delete restrict');expect(code).toContain('begin;');expect(code).toContain('commit;');
});
