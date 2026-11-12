import {test,expect} from '@playwright/test';
import fs from 'node:fs';

// Text-level review regression only. Never connects to or parses in PostgreSQL.
const path='supabase/proposals/participant-company-counselor-registration.sql';
const raw=fs.readFileSync(path,'utf8'),sql=raw.replace(/--[^\n]*/g,'');
const functions=[...sql.matchAll(/create or replace function ([\s\S]*?)end \$\$;/g)].map(m=>m[0]);
const [complete,recovery]=functions;
const compact=s=>s.replace(/\s+/g,' ').trim();

test('review RPCs keep baseline signatures, return types, invoker mode and inserted data',()=>{
  const base=fs.readFileSync('supabase/proposals/participant-company-link.sql','utf8');
  expect(functions).toHaveLength(2);
  for(const [name,body] of [['complete',complete],['recover',recovery]]){
    expect(compact(body)).toContain(`public.secondcareer_${name}_company_registration(request_id uuid,new_user_id uuid,new_internal_email text) returns jsonb language plpgsql security invoker set search_path=''`);
  }
  const inserts=s=>[...s.matchAll(/insert into public\.(?:user_profiles|server_login_lookup|participants)\([\s\S]*?;/g)].map(m=>compact(m[0]));
  expect(inserts(complete)).toEqual(inserts(base));
  expect(complete).toContain("set status='complete',auth_user_id=new_user_id,participant_id=participant,company_name=c.name");
});

test('Auth uses the existing helper for completion and pending cancellation, not committed recovery',()=>{
  expect(sql).not.toMatch(/\b(?:from|join)\s+auth\.users\b/i);
  expect(sql).not.toMatch(/grant[\s\S]*?on\s+(?:table\s+)?auth\.users/i);
  expect(complete).toContain('auth_matches(new_user_id,new_internal_email,request_id,true) is not true');
  expect(recovery).toContain('auth_matches(new_user_id,new_internal_email,request_id,false) is not true');
  const committedStart=recovery.indexOf("if r.status='complete'"),committedEnd=recovery.indexOf('end if;',recovery.indexOf('return pg_catalog.jsonb_build_object',committedStart));
  expect(committedStart).toBeGreaterThan(-1);expect(committedEnd).toBeGreaterThan(committedStart);
  expect(recovery.slice(committedStart,committedEnd)).not.toContain('auth_matches(');
  expect(recovery.slice(committedStart,committedEnd)).toContain('r.auth_user_id<>new_user_id');
  expect(recovery.slice(committedStart,committedEnd)).toContain('p.auth_user_id=new_user_id');
  expect(recovery.slice(committedStart,committedEnd)).toContain("'outcome','complete'");
  expect(recovery.indexOf('auth_matches(')).toBeGreaterThan(committedEnd);
  expect(recovery.indexOf('auth_matches(')).toBeLessThan(recovery.indexOf('set company_cancelled_auth_user_id=new_user_id'));
  expect(sql).not.toMatch(/create(?: or replace)? function secondcareer_company_private|security definer/i);
});

test('completion locks request, company and scoped assignment before Auth and writes; recovery preserves committed data',()=>{
  const markers=["where id=request_id for update",'for share;',"if c.status<>'active'",'perform 1 from public.client_company_counselors',
    'a.organization_id=r.organization_id and a.company_id=r.company_id','a.counselor_user_id=r.counselor_user_id for share',
    "if not found then raise exception 'COUNSELOR_NOT_ASSIGNED'",'auth_matches(', 'insert into public.user_profiles'];
  let prev=-1;
  for(const marker of markers){const pos=complete.indexOf(marker);expect(pos,marker).toBeGreaterThan(prev);prev=pos}
  expect(recovery).not.toContain('from public.client_company_counselors');
  expect(recovery).not.toContain('p.counselor_user_id=r.counselor_user_id');
  expect(recovery).toContain('p.company_id=r.company_id');
  expect(recovery).toContain('set company_cancelled_auth_user_id=new_user_id');
  expect(sql).not.toMatch(/\bdelete\s+from|\btruncate\b|\bdrop\b/i);
});

test('unconditional stop, unresolved body hashes, metadata checks and client execution revokes remain',()=>{
  expect(sql.trim()).toMatch(/^begin;/);expect(sql.trim()).toMatch(/commit;$/);
  expect(sql).toContain("set local lock_timeout='5s'");expect(sql).toContain("set local statement_timeout='30s'");
  const stop=sql.indexOf("raise exception 'SCHEMA_REVIEW_REQUIRED");
  expect(stop).toBeGreaterThan(0);expect(stop).toBeLessThan(sql.indexOf('grant update('));
  expect(sql).toContain('__REVIEW_COMPLETE_FUNCTION_MD5__');expect(sql).toContain('__REVIEW_RECOVERY_FUNCTION_MD5__');
  const dos=[...sql.matchAll(/do \$\$([\s\S]*?)end \$\$;/g)].map(m=>m[1]);
  expect(dos).toHaveLength(2);expect(dos[1]).toMatch(/declare installed record;/);
  expect(dos[1]).toContain('installed.prorettype');expect(dos[1]).toContain('has_function_privilege');
  expect(sql).toContain('grant update(counselor_user_id) on public.client_company_counselors to service_role');
  for(const name of ['complete','recover']){
    expect(sql).toContain(`revoke all on function public.secondcareer_${name}_company_registration(uuid,uuid,text) from public,anon,authenticated`);
    expect(sql).toContain(`grant execute on function public.secondcareer_${name}_company_registration(uuid,uuid,text) to service_role`);
  }
});
