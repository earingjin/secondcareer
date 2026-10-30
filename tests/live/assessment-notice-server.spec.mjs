import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{transformSync}=require('esbuild');

function setup(){
  const profiles=[{user_id:'c1',organization_id:'org1',role:'counselor'},{user_id:'c2',organization_id:'org1',role:'counselor'},{user_id:'p1',organization_id:'org1',role:'participant'}];
  const parts=[{id:'own',auth_user_id:'p1',organization_id:'org1',counselor_user_id:'c1',display_name:'담당'},
    {id:'missing',auth_user_id:null,organization_id:'org1',counselor_user_id:'c1',display_name:'미연결'},
    {id:'other',auth_user_id:'p2',organization_id:'org1',counselor_user_id:'c2',display_name:'다른 상담사'},
    {id:'unassigned',auth_user_id:'p3',organization_id:'org1',counselor_user_id:null,display_name:'미배정'},
    {id:'cross-org',auth_user_id:'p4',organization_id:'org2',counselor_user_id:'c1',display_name:'다른 조직'}];
  const lookup=[{user_id:'p1',login_id:'my-id',internal_email:'private@example.invalid'},...['p2','p3','p4'].map(user_id=>({user_id,login_id:'secret-'+user_id,internal_email:'private@example.invalid'}))];
  const calls=[];let handler;
  const db={auth:{getUser:async token=>({data:{user:profiles.some(p=>p.user_id===token)?{id:token,app_metadata:{}}:null},error:null})},from(name){
    let rows=({participants:parts,user_profiles:profiles,server_login_lookup:lookup,assessments:[]})[name]||[],columns='*';
    const q={select(c){columns=c;return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,v){calls.push({name,key:k,values:[...v]});rows=rows.filter(r=>v.includes(r[k]));return q},limit(n){rows=rows.slice(0,n);return q},maybeSingle:async()=>({data:rows[0]||null,error:null}),then(resolve,reject){const fields=columns.split(',');return Promise.resolve({data:rows.map(row=>Object.fromEntries(fields.map(k=>[k,row[k]]))),error:null}).then(resolve,reject)}};return q;
  }};
  const context=vm.createContext({Request,Response,URL,TextEncoder,TextDecoder,Uint8Array,Date,Math,Deno:{env:{get:()=> 'fixture'},serve:f=>{handler=f}}});
  const cache=new Map(),root=path.resolve('supabase/functions/secondcareer-assessment');
  function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);
    const code=transformSync(fs.readFileSync(file,'utf8'),{loader:file.endsWith('.ts')?'ts':'js',format:'cjs',target:'es2022'}).code;
    vm.runInContext('(function(require,module,exports){'+code+'\n})',context,{filename:file})(s=>s.startsWith('npm:')?{createClient:()=>db}:load(path.resolve(path.dirname(file),s)),module,module.exports);return module.exports;}
  load(path.join(root,'index.ts'));
  return {calls,async request(token){const r=await handler(new Request('https://example.invalid/',{headers:{authorization:'Bearer '+token}}));return {status:r.status,data:await r.json()}}};
}

test('assessment only returns login IDs for filtered assigned participants',async()=>{
  const h=setup(),response=await h.request('c1');expect(response.status).toBe(200);
  expect(response.data.participants.map(p=>[p.id,p.login_id])).toEqual([['own','my-id'],['missing',null]]);
  expect(h.calls.filter(c=>c.name==='server_login_lookup')).toEqual([{name:'server_login_lookup',key:'user_id',values:['p1']}]);
  expect(JSON.stringify(response.data)).not.toMatch(/private@example|secret-p[234]|auth_user_id|internal_email/);
  h.calls.length=0;const participant=await h.request('p1');expect(participant.status).toBe(200);
  expect(participant.data.participants).toHaveLength(1);expect(participant.data.participants[0].login_id).toBeUndefined();
  expect(h.calls.some(c=>c.name==='server_login_lookup')).toBe(false);
  h.calls.length=0;const other=await h.request('c2');expect(other.data.participants.map(p=>p.login_id)).toEqual(['secret-p2']);
  expect(JSON.stringify(other.data)).not.toContain('my-id');
});
