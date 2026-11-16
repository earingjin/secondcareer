import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const get=(h,actor=ids.admin,query='')=>h.call(h.unlinked.handleAdminUnlinked,actor,null,'GET','https://fixture.invalid/'+query);
const participant=(id,org=ids.org,companyId=null,name='검토 대상',companyName='같은 기업')=>({id,organization_id:org,company_id:companyId,display_name:name,company_name:companyName,counselor_user_id:ids.counselor,phone:'01099998888',login_id:'secret'});

test('unlinked read scopes by organization and NULL company ID without name-based linking or private fields',async()=>{
  const h=harness(),a=crypto.randomUUID(),b=crypto.randomUUID(),foreign=crypto.randomUUID();
  h.state.tables.client_companies.push({id:crypto.randomUUID(),organization_id:ids.org,name:'같은 기업',status:'active'});
  h.state.tables.participants.push(participant(a),participant(b,ids.org,crypto.randomUUID()),participant(foreign,'other-org'));
  const r=await get(h);expect(r.status).toBe(200);expect(r.data.scope).toBe('unlinked');
  expect(r.data.participants.map(p=>p.id)).toContain(a);expect(r.data.participants.map(p=>p.id)).not.toContain(b);expect(r.data.participants.map(p=>p.id)).not.toContain(foreign);
  expect(r.data.participants.find(p=>p.id===a)).toMatchObject({companyName:'같은 기업',status:'unlinked',counselorName:'상담사'});
  expect(JSON.stringify(r.data)).not.toMatch(/01099998888|secret|loginId|auth_user_id|answer/);
  expect(h.state.writes).toHaveLength(0);
});

test('unlinked name and historical company searches stay scoped and pages do not overlap',async()=>{
  const h=harness();h.state.tables.participants.length=0;
  for(let i=0;i<43;i++)h.state.tables.participants.push(participant(String(i).padStart(3,'0'),ids.org,null,i%2?'홍길동':'김민지',i%2?'A기업':'B기업'));
  h.state.tables.participants.push(participant('linked',ids.org,crypto.randomUUID(),'홍길동','A기업'));
  const pages=[];for(let page=1;page<=3;page++){const r=await get(h,ids.admin,`?page=${page}`);expect(r.status).toBe(200);expect(r.data.total).toBe(43);pages.push(...r.data.participants.map(p=>p.id))}
  expect(pages).toHaveLength(43);expect(new Set(pages).size).toBe(43);
  const r=await get(h,ids.admin,'?name=홍길동&companyName=A기업');expect(r.status).toBe(200);expect(r.data.total).toBe(21);expect(r.data.participants.every(p=>p.name==='홍길동'&&p.companyName==='A기업')).toBe(true);
});

test('unlinked read rejects other roles, scope parameters and write methods; read failures do not widen scope',async()=>{
  const h=harness();for(const actor of [ids.counselor,ids.participant,ids.other])expect((await get(h,actor)).status).toBe(403);
  h.state.tables.user_profiles.find(p=>p.user_id===ids.other).role='company_manager';expect((await get(h,ids.other)).status).toBe(403);
  for(const query of ['?organizationId=other-org','?companyId=abc','?page=0','?name=x&name=y'])expect((await get(h,ids.admin,query)).status).toBe(400);
  expect((await h.call(h.unlinked.handleAdminUnlinked,ids.admin,{},'POST')).status).toBe(405);
  h.state.failReadsOf='participants';expect((await get(h)).status).toBe(503);expect(h.state.writes).toHaveLength(0);
});
