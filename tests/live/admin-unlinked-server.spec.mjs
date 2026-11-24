import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
test('retired lookup never returns data even when historical name and paging filters are supplied',async()=>{
 const h=harness();
 for(const suffix of ['','?name=fixture&companyName=sample&page=2']){
  const r=await h.call(h.unlinked.handleAdminUnlinked,ids.admin,null,'GET','https://fixture.invalid/'+suffix);
  expect(r.status).toBe(410);
  expect(r.data).toEqual({error:'UNLINKED_WORKFLOW_RETIRED'});
 }
 expect(h.state.reads.some(r=>r.table==='participants')).toBe(false);
});
