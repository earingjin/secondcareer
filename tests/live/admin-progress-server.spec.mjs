// REQ-A-004 admin progress API against the local protocol mock (server-harness.cjs).
// This checks role/scope handling, counting and response minimisation in the
// function code. It does not exercise real Postgres, RLS or a deployed function.
import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const OTHER_ADMIN='10000000-0000-4000-8000-000000000009';

function seed({postEnabled=false}={}){
  const h=harness();h.state.postEnabled=postEnabled;
  const t=h.state.tables;t.participants.length=0;
  const add=(id,company,org=ids.org)=>t.participants.push({id,organization_id:org,counselor_user_id:ids.counselor,auth_user_id:'auth-'+id,display_name:'이름-'+id,phone:'01000000000',company_name:company});
  const answer=(participant,phase,status)=>t.assessments.push({id:`a-${phase}-${participant}`,participant_id:participant,phase,status,answers:{reg:{name:'응답원문-'+participant}},result:{comment:'결과원문'},updated_at:'2026-10-01T00:00:00Z',submitted_at:status==='submitted'?'2026-10-01T00:00:00Z':null});
  // 가 기업: 4명 (pre: new, draft, submitted, submitted; post: -, -, draft, submitted)
  add('p01','가 기업');add('p02','가 기업');add('p03','가 기업');add('p04',' 가 기업 ');
  answer('p02','pre','draft');answer('p03','pre','submitted');answer('p04','pre','submitted');answer('p03','post','draft');answer('p04','post','submitted');
  // 나 기업: 1명 submitted; 소속기업 미지정: 2명 (빈 값, null)
  add('p05','나 기업');answer('p05','pre','submitted');
  add('p06','');add('p07',null);answer('p07','pre','draft');
  // 다른 조직: never counted for ids.admin
  add('x01','가 기업','other-org');add('x02','다른 기업','other-org');answer('x01','pre','submitted');answer('x02','pre','draft');answer('x01','post','submitted');
  t.user_profiles.push({user_id:OTHER_ADMIN,organization_id:'other-org',role:'admin',display_name:'다른 조직 관리자'});
  h.state.users[OTHER_ADMIN]={id:OTHER_ADMIN,app_metadata:{}};
  return h;
}
const get=(h,token,url)=>h.call(h.progress.handleAdminProgress,token,undefined,'GET',url);
const sum=(list,f)=>list.reduce((s,c)=>s+f(c),0);

test('1·6·8 allowed admin gets organization counts by pre state and company, totals add up',async()=>{
  const h=seed(),r=await get(h,ids.admin);
  expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');
  expect(r.data.scope).toBe('organization');expect(r.data.total).toBe(7);
  expect(r.data.pre).toEqual({notStarted:2,draft:2,submitted:3});
  expect(r.data.companies).toEqual([
    {name:'가 기업',total:4,pre:{notStarted:1,draft:1,submitted:2},post:{available:false}},
    {name:'나 기업',total:1,pre:{notStarted:0,draft:0,submitted:1},post:{available:false}},
    {name:null,total:2,pre:{notStarted:1,draft:1,submitted:0},post:{available:false}}]);
  expect(sum(r.data.companies,c=>c.total)).toBe(r.data.total);
  for(const k of ['notStarted','draft','submitted'])expect(sum(r.data.companies,c=>c.pre[k])).toBe(r.data.pre[k]);
});

test('7 post counts are returned only when the post feature flag is on',async()=>{
  const off=seed(),r=await get(off,ids.admin);
  expect(r.data.post).toEqual({available:false});
  expect(off.state.reads.filter(x=>x.table==='assessments').every(x=>x.filters.some(([k,v])=>k==='phase'&&v==='pre'))).toBe(true);
  const on=seed({postEnabled:true}),p=await get(on,ids.admin);
  expect(p.data.post).toEqual({available:true,notStarted:5,draft:1,submitted:1});
  expect(p.data.companies[0].post).toEqual({available:true,notStarted:2,draft:1,submitted:1});
  for(const k of ['notStarted','draft','submitted'])expect(sum(p.data.companies,c=>c.post[k])).toBe(p.data.post[k]);
});

test('2·3 counselor, participant, other roles and unauthenticated requests are refused',async()=>{
  const h=seed();
  h.state.tables.user_profiles.push({user_id:'manager-user',organization_id:ids.org,role:'manager',display_name:'고객사'});h.state.users['manager-user']={id:'manager-user',app_metadata:{}};
  for(const [token,status] of [[ids.counselor,403],[ids.participant,403],[ids.other,403],['manager-user',403],[null,401],['unknown-token',401]]){
    const r=await get(h,token);expect(r.status).toBe(status);expect(r.data.total).toBeUndefined();expect(r.data.companies).toBeUndefined();
  }
  // A role or organization in the request body/metadata is not a source of permission.
  h.state.users[ids.counselor].user_metadata={role:'admin'};h.state.users[ids.counselor].app_metadata={role:'admin'};
  expect((await get(h,ids.counselor)).status).toBe(403);
  // An admin who still has to change the first password is also refused.
  h.state.users[ids.admin].app_metadata={must_change_password:true};
  expect((await get(h,ids.admin)).data).toEqual({error:'PASSWORD_CHANGE_REQUIRED'});
  expect(h.state.reads.filter(x=>['participants','assessments'].includes(x.table))).toHaveLength(0);
  expect((await h.call(h.progress.handleAdminProgress,ids.admin,{organizationId:'other-org'})).status).toBe(405);
});

test('4 another organization is never counted and cannot be requested by ID',async()=>{
  const h=seed({postEnabled:true}),own=await get(h,ids.admin);
  expect(own.data.total).toBe(7);expect(JSON.stringify(own.data)).not.toContain('다른 기업');
  const participantReads=h.state.reads.filter(x=>x.table==='participants');
  expect(participantReads.length).toBeGreaterThan(0);
  expect(participantReads.every(x=>x.filters.some(([k,v,op])=>k==='organization_id'&&v===ids.org&&op==='eq'))).toBe(true);
  for(const read of h.state.reads.filter(x=>x.table==='assessments'))
    expect(read.filters.find(([k])=>k==='participant_id')[1].every(id=>id.startsWith('p'))).toBe(true);
  for(const query of ['?organizationId=other-org','?organization_id=other-org','?company=%EA%B0%80','?scope=all'])
    expect((await get(h,ids.admin,'https://fixture.invalid/'+query)).status).toBe(400);
  const other=await get(h,OTHER_ADMIN);
  expect(other.data.total).toBe(2);expect(other.data.pre).toEqual({notStarted:0,draft:1,submitted:1});
  expect(other.data.post).toEqual({available:true,notStarted:1,draft:0,submitted:1});
});

test('5 zero participants return zero counts and an empty company list',async()=>{
  const h=harness();h.state.tables.participants.length=0;h.state.postEnabled=true;
  const r=await get(h,ids.admin);
  expect(r.status).toBe(200);
  expect(r.data).toMatchObject({total:0,pre:{notStarted:0,draft:0,submitted:0},post:{available:true,notStarted:0,draft:0,submitted:0},companies:[]});
  expect(h.state.reads.filter(x=>x.table==='assessments')).toHaveLength(0);
});

test('response and reads carry no answers, results, names, contacts or internal IDs',async()=>{
  const h=seed({postEnabled:true}),r=await get(h,ids.admin),text=JSON.stringify(r.data);
  for(const secret of ['응답원문','결과원문','이름-','01000000000','auth-','p01','a-pre-','counselor',ids.org,ids.admin])expect(text).not.toContain(secret);
  expect(Object.keys(r.data).sort()).toEqual(['companies','generatedAt','post','pre','scope','total']);
  const columns=new Set(h.state.reads.filter(x=>['participants','assessments'].includes(x.table)).flatMap(x=>x.columns.split(',')));
  expect([...columns].sort()).toEqual(['company_name','id','participant_id','status']);
});

test('paged reads over the row limit count every participant once',async()=>{
  const h=harness(),t=h.state.tables;t.participants.length=0;h.state.pageSize=37;h.state.postEnabled=true;
  for(let i=0;i<250;i++){
    const id='q'+String(i).padStart(4,'0');
    t.participants.push({id,organization_id:ids.org,company_name:i%2?'홀수 기업':'짝수 기업'});
    if(i%5)t.assessments.push({id:'pre-'+id,participant_id:id,phase:'pre',status:i%5===1?'draft':'submitted'});
    if(i%10===0)t.assessments.push({id:'post-'+id,participant_id:id,phase:'post',status:'submitted'});
  }
  const r=await get(h,ids.admin);
  expect(r.status).toBe(200);expect(r.data.total).toBe(250);
  expect(r.data.pre).toEqual({notStarted:50,draft:50,submitted:150});
  expect(r.data.post).toEqual({available:true,notStarted:225,draft:0,submitted:25});
  expect(r.data.companies.map(c=>[c.name,c.total])).toEqual([['짝수 기업',125],['홀수 기업',125]]);
  expect(h.state.reads.filter(x=>x.table==='assessments').every(x=>x.filters.find(([k])=>k==='participant_id')[1].length<=100)).toBe(true);
});

test('unknown states, duplicate rows and failed reads fail closed without partial counts',async()=>{
  const unknown=seed();unknown.state.tables.assessments.push({id:'a-odd',participant_id:'p01',phase:'pre',status:'archived'});
  expect((await get(unknown,ids.admin)).data).toEqual({error:'ASSESSMENT_STATE_INVALID'});
  const duplicate=seed();duplicate.state.tables.assessments.push({id:'a-dup',participant_id:'p03',phase:'pre',status:'draft'});
  expect((await get(duplicate,ids.admin)).data).toEqual({error:'ASSESSMENT_STATE_INVALID'});
  for(const table of ['participants','assessments']){
    const h=seed();h.state.failReadsOf=table;const r=await get(h,ids.admin);
    expect(r.status).toBe(503);expect(r.data).toEqual({error:'QUERY_FAILED'});
  }
});
