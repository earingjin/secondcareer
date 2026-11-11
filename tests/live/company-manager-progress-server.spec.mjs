import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');

// STEP 14-D: company manager progress (protocol mock, synthetic data only).
const counselorB='10000000-0000-4000-8000-0000000000b2';
async function setup({postEnabled=false}={}){
  const h=harness();h.state.managerEnabled=true;h.state.postEnabled=postEnabled;
  h.state.tables.user_profiles.push({user_id:counselorB,organization_id:ids.org,role:'counselor',display_name:'나상담'});
  const company={id:randomUUID(),name:'허용 합성 고객사',organization_id:ids.org,status:'active'},other={id:randomUUID(),name:'두번째 합성 고객사',organization_id:ids.org,status:'active'};
  const blocked={id:randomUUID(),name:'미허용 합성 고객사',organization_id:ids.org,status:'active'},foreign={id:randomUUID(),name:'타조직 고객사',organization_id:'other-org',status:'active'};
  h.state.tables.client_companies.push(company,other,blocked,foreign);
  const issued=await h.call(h.managers.handleAdminCompanyManagers,ids.admin,{name:'합성 담당자',email:'m@example.invalid',phone:'01000000000',requestId:randomUUID()},'POST','https://fixture.invalid/?companyId='+company.id);
  const managerId=issued.data.managerId;
  await h.call(h.manager.handleCompanyManager,managerId,{action:'change-password',password:'Changed-manager-123!'});
  return {h,company,other,blocked,foreign,managerId,loginId:issued.data.loginId};
}
// Adds participants: spec = [counselorId|null, preState|null, postState|null] per row.
function add(h,company,rows,{linked=true,org=ids.org}={}){
  const out=[];
  for(const [counselor,pre,post] of rows){
    const id=randomUUID();out.push(id);
    h.state.tables.participants.push({id,organization_id:org,auth_user_id:randomUUID(),counselor_user_id:counselor,display_name:'합성참여자'+id.slice(0,4),phone:'01099998888',company_name:company.name,login_id:'secret_login_'+id.slice(0,4),...(linked?{company_id:company.id}:{})});
    for(const [phase,status] of [['pre',pre],['post',post]])if(status)h.state.tables.assessments.push({id:randomUUID(),participant_id:id,phase,status,answers:{pre:[1,2,3]},result:{score:77}});
  }
  return out;
}
const rep=(n,row)=>Array.from({length:n},()=>row);
const get=(h,id,companyId,extra='')=>h.call(h.managerProgress.handleCompanyManagerProgress,id,null,'GET','https://fixture.invalid/?companyId='+companyId+extra);

test('one company: company_id population, stage counts, completion rate and counselor rows; unlinked and other rows excluded',async()=>{
  const {h,company,other,managerId}=await setup();
  const pids=add(h,company,[...rep(5,[ids.counselor,'submitted']),...rep(5,[ids.counselor,null]),...rep(5,[counselorB,'submitted']),...rep(5,[counselorB,'draft'])]);
  add(h,company,rep(3,[ids.counselor,'submitted']),{linked:false});add(h,other,rep(6,[ids.counselor,'submitted']));
  const r=await get(h,managerId,company.id);expect(r.status).toBe(200);
  const d=r.data;expect(d).toMatchObject({companyId:company.id,companyName:company.name,basis:'participants.company_id',total:20,suppressed:false,postAvailable:false,suppression:{minimumGroupSize:5,provisional:true}});
  expect(Number.isFinite(Date.parse(d.generatedAt))).toBe(true);
  expect(d.pre).toEqual({available:true,notStarted:5,draft:5,submitted:10,completionRate:50});expect(d.post).toEqual({available:false});
  expect(d.counselors).toEqual([
    {label:'나상담',unresolved:false,total:10,pre:{submitted:5,completionRate:50},post:{available:false}},
    {label:'상담사',unresolved:false,total:10,pre:{submitted:5,completionRate:50},post:{available:false}}]);
  const text=JSON.stringify(d);
  for(const secret of [...pids,'합성참여자','01099998888','secret_login_',ids.counselor,counselorB,'answers','result','score',ids.org,other.name])expect(text).not.toContain(secret);
  expect(Object.keys(d).sort()).toEqual(['basis','companyId','companyName','counselors','generatedAt','post','postAvailable','pre','suppressed','suppression','total']);
});

test('post enabled: not started, draft and submitted counts and rate on the full company denominator',async()=>{
  const {h,company,managerId}=await setup({postEnabled:true});
  add(h,company,[...rep(5,[ids.counselor,'submitted','submitted']),...rep(5,[ids.counselor,'submitted','draft']),...rep(10,[counselorB,'submitted',null])]);
  const d=(await get(h,managerId,company.id)).data;
  expect(d.postAvailable).toBe(true);expect(d.pre).toEqual({available:true,notStarted:0,draft:0,submitted:20,completionRate:100});
  expect(d.post).toEqual({available:true,notStarted:10,draft:5,submitted:5,completionRate:25});
  expect(d.counselors).toEqual([
    {label:'나상담',unresolved:false,total:10,pre:{submitted:10,completionRate:100},post:{submitted:0,completionRate:0}},
    {label:'상담사',unresolved:false,total:10,pre:{submitted:10,completionRate:100},post:{submitted:5,completionRate:50}}]);
});

test('zero participants, below-minimum company and invalid counselors are distinct states without hidden values',async()=>{
  const {h,company,other,managerId}=await setup({postEnabled:true});
  await h.call(h.managers.handleAdminCompanyManagers,ids.admin,{action:'grant',managerId},'PATCH','https://fixture.invalid/?companyId='+other.id);
  const zero=(await get(h,managerId,company.id)).data;expect(zero).toMatchObject({total:0,suppressed:false,counselors:[]});
  expect(zero.pre).toEqual({available:true,notStarted:0,draft:0,submitted:0,completionRate:null});
  add(h,other,rep(3,[ids.counselor,'submitted']));
  const few=(await get(h,managerId,other.id)).data;expect(few).toMatchObject({total:null,suppressed:true,pre:null,post:null,counselors:[]});
  expect(JSON.stringify(few)).not.toMatch(/"(?:total|submitted|notStarted|draft)":[1-9]/);
  // Foreign-organization and missing counselors are one unresolved group, never an identifier.
  add(h,company,[...rep(6,[ids.counselor,'submitted']),...rep(3,[ids.other,'submitted']),...rep(3,[null,'submitted'])]);
  const d=(await get(h,managerId,company.id)).data;expect(d.total).toBe(12);
  expect(d.counselors.map(c=>[c.label,c.unresolved,c.total])).toEqual([['상담사',false,6],['담당 확인 필요',true,6]]);
  expect(JSON.stringify(d)).not.toContain(ids.other);expect(JSON.stringify(d)).not.toContain('다른 조직');
});

test('small cells are withheld as null and cannot be recovered by subtracting from published totals',async()=>{
  const {h,company,managerId}=await setup();
  // pre: notStarted 2, draft 1, submitted 9 of 12. Counselor rows: 8 / 3 / unresolved 1.
  add(h,company,[...rep(6,[ids.counselor,'submitted']),...rep(2,[ids.counselor,null]),...rep(3,[counselorB,'submitted']),[null,'draft']]);
  const d=(await get(h,managerId,company.id)).data;
  expect(d.total).toBe(12);
  // Two small cells sum to 3 (< 5), so submitted is withheld too: none of 2/1/9 is derivable.
  expect(d.pre).toEqual({available:true,notStarted:null,draft:null,submitted:null,completionRate:null});
  // Small rows 3 and 1 sum to 4, so the 8 row is withheld too; submitted withheld with the company figure.
  for(const c of d.counselors)expect(c).toMatchObject({total:null,pre:{submitted:null,completionRate:null}});
  expect(JSON.stringify(d)).not.toMatch(/:(?:0|1|2|3|8|9)[,}]/);

  const {h:h2,company:c2,managerId:m2}=await setup();
  // One small row (2) next to an 11 row: the single hidden row would equal total - 11, so 11 is withheld too.
  // Company not started 3 and draft 2 are both small but together 5, so submitted 8 stays published.
  add(h2,c2,[...rep(6,[ids.counselor,'submitted']),...rep(3,[ids.counselor,null]),...rep(2,[ids.counselor,'draft']),...rep(2,[counselorB,'submitted'])]);
  const e=(await get(h2,m2,c2.id)).data;
  expect(e.pre).toEqual({available:true,notStarted:null,draft:null,submitted:8,completionRate:61.5});
  expect(e.counselors.map(c=>c.total)).toEqual([null,null]);expect(e.counselors.map(c=>c.pre.submitted)).toEqual([null,null]);
});

test('withhold: primary small cells, single-cell complement and small hidden sums',()=>{
  const {h}={h:harness()},w=(v,rest)=>[...h.managerProgress.withhold(v,v.map(x=>x>0&&x<5),rest)].sort();
  // [10,2,0]: hiding 2 alone is recoverable; adding 0 still sums to 2, so 10 is withheld as well.
  expect(w([10,10,0])).toEqual([]);expect(w([10,2,0])).toEqual([0,1,2]);expect(w([10,2,1])).toEqual([0,1,2]);
  expect(w([6,7,3,4])).toEqual([2,3]);expect(w([20,3,4])).toEqual([1,2]);expect(w([10,10,3])).toEqual([0,2]);
  expect([...h.managerProgress.withhold([9,9],[true,false],[1,1])].sort()).toEqual([0,1]);
});

test('multiple allowed companies switch; other, foreign and unauthorised companies return no data',async()=>{
  const {h,company,other,blocked,foreign,managerId}=await setup();
  add(h,company,rep(5,[ids.counselor,'submitted']));add(h,other,rep(6,[ids.counselor,'draft']));add(h,blocked,rep(7,[ids.counselor,'submitted']));add(h,foreign,rep(8,[ids.counselor,'submitted']),{org:'other-org'});
  expect((await get(h,managerId,other.id)).status).toBe(403);
  await h.call(h.managers.handleAdminCompanyManagers,ids.admin,{action:'grant',managerId},'PATCH','https://fixture.invalid/?companyId='+other.id);
  expect((await get(h,managerId,company.id)).data).toMatchObject({companyId:company.id,total:5});
  expect((await get(h,managerId,other.id)).data).toMatchObject({companyId:other.id,total:6,pre:{draft:6}});
  for(const c of [blocked,foreign,{id:randomUUID()}]){const r=await get(h,managerId,c.id);expect(r.status).toBe(403);expect(JSON.stringify(r.data)).toBe('{"error":"FORBIDDEN"}')}
  // Metadata or extra parameters cannot widen scope.
  h.state.users[managerId].user_metadata={organization_id:'other-org',companyId:blocked.id,role:'admin'};h.state.users[managerId].app_metadata.companyIds=[blocked.id];
  expect((await get(h,managerId,blocked.id)).status).toBe(403);
  for(const extra of ['&organizationId=other-org','&participantId=x','&companyId='+blocked.id])expect((await get(h,managerId,company.id,extra)).status).toBe(400);
  for(const url of ['https://fixture.invalid/','https://fixture.invalid/?companyId=not-a-uuid'])expect((await h.call(h.managerProgress.handleCompanyManagerProgress,managerId,null,'GET',url)).status).toBe(400);
});

test('revocation, suspension, initial password and feature flag are re-checked on every request',async()=>{
  const {h,company,managerId}=await setup();add(h,company,rep(5,[ids.counselor,'submitted']));
  const patch=body=>h.call(h.managers.handleAdminCompanyManagers,ids.admin,{managerId,...body},'PATCH','https://fixture.invalid/?companyId='+company.id);
  expect((await get(h,managerId,company.id)).status).toBe(200);
  await patch({action:'status',status:'suspended'});expect((await get(h,managerId,company.id)).status).toBe(403);
  await patch({action:'status',status:'active'});expect((await get(h,managerId,company.id)).status).toBe(200);
  await patch({action:'revoke'});const revoked=await get(h,managerId,company.id);expect(revoked.status).toBe(403);expect(revoked.data).not.toHaveProperty('total');
  await patch({action:'grant'});h.state.managerEnabled=false;expect((await get(h,managerId,company.id)).status).toBe(503);h.state.managerEnabled=true;
  h.state.tables.company_manager_accounts[0].must_change_password=true;const gated=await get(h,managerId,company.id);expect(gated.status).toBe(403);expect(gated.data.error).toBe('PASSWORD_CHANGE_REQUIRED');
  h.state.tables.company_manager_accounts[0].must_change_password=false;
  h.state.failReadsOf='company_manager_access';expect((await get(h,managerId,company.id)).status).toBe(503);h.state.failReadsOf=null;
  h.state.failReadsOf='assessments';const failed=await get(h,managerId,company.id);expect(failed.status).toBe(503);expect(failed.data).not.toHaveProperty('total');
});

test('only company managers can read; writes and other roles are rejected; manager writes elsewhere stay denied',async()=>{
  const {h,company,managerId}=await setup();add(h,company,rep(5,[ids.counselor,'submitted']));
  for(const actor of [ids.admin,ids.counselor,ids.participant,ids.other])expect((await get(h,actor,company.id)).status).toBe(403);
  for(const actor of [null,'expired'])expect((await get(h,actor,company.id)).status).toBe(401);
  for(const method of ['POST','PATCH','PUT','DELETE'])expect((await h.call(h.managerProgress.handleCompanyManagerProgress,managerId,method==='DELETE'||method==='PUT'?null:{x:1},method,'https://fixture.invalid/?companyId='+company.id)).status).toBe(405);
  const before=structuredClone(h.state.tables.participants),assessments=structuredClone(h.state.tables.assessments);
  for(const [handler,body,method,url] of [
    [h.assessment,{action:'draft',answers:{}},'POST'],[h.assessment,null,'GET','https://fixture.invalid/?id='+before.at(-1).id+'&kind=c'],
    [h.adminReport.handleAdminReport,null,'GET','https://fixture.invalid/?id='+before.at(-1).id+'&kind=p'],[h.aggregate.handleAdminAggregate,null,'GET'],[h.progress.handleAdminProgress,null,'GET'],[h.directory.handleAdminDirectory,null,'GET'],
    [h.companies.handleAdminCompanies,{name:'x'},'POST'],[h.registration.handleRegistration,{displayName:'x'},'POST'],
    [h.managers.handleAdminCompanyManagers,{action:'grant',managerId},'PATCH','https://fixture.invalid/?companyId='+company.id]
  ])expect((await h.call(handler,managerId,body,method,url)).status).toBe(403);
  expect(h.state.tables.participants).toEqual(before);expect(h.state.tables.assessments).toEqual(assessments);
});
