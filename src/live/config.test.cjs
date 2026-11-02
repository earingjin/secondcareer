// Run with: node --test src/live/config.test.cjs. No request reaches Supabase.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {transformSync}=require('esbuild');

const built=transformSync(fs.readFileSync('src/live/api.js','utf8'),{format:'cjs',define:{'import.meta.env':'{}'}}).code;
const configBuilt=transformSync(fs.readFileSync('src/live/config.js','utf8'),{format:'cjs'}).code;
const fake={VITE_SP_ENV:'test',VITE_SP_TEST_PROJECT_ID:'abcdefghijklmnopqrst',VITE_SP_TEST_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',VITE_SP_TEST_PUBLISHABLE_KEY:'sb_publishable_fixture_key'};
const prod='https://tafrbtqjlrokdnhudswb.supabase.co';
function load(code,fetch=()=>{throw Error('unexpected network request')}){
  const module={exports:{}},storage=new Map();
  const ctx={module,exports:module.exports,URL,Response,AbortSignal,Date,Number,Array,Object,JSON,Error,setTimeout,clearTimeout,fetch,require:()=>load(configBuilt).exports,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
  vm.runInNewContext(code,ctx);return {exports:module.exports,storage};
}
test('production default and explicit production preserve the existing target',()=>{
  const {resolveConfig}=load(configBuilt).exports;
  assert.equal(resolveConfig({}).url,prod);assert.equal(resolveConfig({VITE_SP_ENV:'production'}).url,prod);
});
test('test mode rejects missing, invalid or production settings before any fetch',()=>{
  let calls=0;const {createAPI}=load(built,()=>{calls++;throw Error('network')}).exports;
  const cases=[{MODE:'test'},{MODE:'test',VITE_SP_ENV:'production'},...Object.keys(fake).map(k=>{const x={...fake};delete x[k];return x}).slice(1),
    {...fake,VITE_SP_ENV:'unknown'},{...fake,VITE_SP_TEST_PROJECT_ID:'bad'},
    {...fake,VITE_SP_TEST_SUPABASE_URL:prod},{...fake,VITE_SP_TEST_PROJECT_ID:'tafrbtqjlrokdnhudswb',VITE_SP_TEST_SUPABASE_URL:prod},{...fake,VITE_SP_TEST_SUPABASE_URL:fake.VITE_SP_TEST_SUPABASE_URL+'/path'},
    {...fake,VITE_SP_TEST_SUPABASE_URL:fake.VITE_SP_TEST_SUPABASE_URL+'@'+new URL(prod).hostname},
    {...fake,VITE_SP_TEST_PUBLISHABLE_KEY:'sb_secret_example'}, {...fake,VITE_SP_TEST_PUBLISHABLE_KEY:'eyJ.service_role.signature'},
    {...fake,VITE_SP_TEST_PUBLISHABLE_KEY:'sb_publishable_va6hVj1FwfrxMiD6IQb81Q_AWE5m0-8'}];
  for(const c of cases)assert.throws(()=>createAPI(()=>{},c));assert.equal(calls,0);
});
test('request path validation refuses absolute, network-path and backslash host escapes',()=>{
  const {resolveConfig,requestTarget}=load(configBuilt).exports,c=resolveConfig(fake);
  for(const p of ['https://example.com/x','//example.com/x','/\\\\example.com/x'])assert.throws(()=>requestTarget(c,p));
  assert.equal(requestTarget(c,'/functions/v1/secondcareer-assessment?id=one'),fake.VITE_SP_TEST_SUPABASE_URL+'/functions/v1/secondcareer-assessment?id=one');
});
test('test API uses only the test origin and forbids redirects across login, restore and diagnosis',async()=>{
  const calls=[];
  const fetch=async(url,options)=>{calls.push({url,options});const path=new URL(url).pathname;
    if(path.endsWith('/secondcareer-login')||path==='/auth/v1/token')return Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600});
    if(path.endsWith('/secondcareer-account'))return Response.json({profile:{role:'participant'},mustChangePassword:false});
    if(path.endsWith('/secondcareer-assessment'))return Response.json(options.method==='POST'?{status:'draft'}:{profile:{role:'participant'},participants:[{id:'fixture'}],assessments:[]});
    throw Error('unexpected request');};
  const {exports,storage}=load(built,fetch),api=exports.createAPI(()=>{},fake);
  await api.login('fixture','fixture');await api.write('draft',{answers:{}});api.clear();storage.set('sp-live-refresh-token-test-'+fake.VITE_SP_TEST_PROJECT_ID,'test-refresh');await api.restore();api.clear();
  assert.ok(calls.length>=6);for(const c of calls){assert.equal(new URL(c.url).origin,fake.VITE_SP_TEST_SUPABASE_URL);assert.equal(c.options.redirect,'error');assert.equal(c.options.headers.apikey,fake.VITE_SP_TEST_PUBLISHABLE_KEY)}
  assert.ok(calls.some(c=>c.url.endsWith('/functions/v1/secondcareer-login')));assert.ok(calls.some(c=>c.url.includes('/auth/v1/token?grant_type=refresh_token')));assert.ok(calls.some(c=>c.url.endsWith('/functions/v1/secondcareer-assessment')&&c.options.method==='POST'));
});
test('test session does not restore the production refresh token',async()=>{
  let calls=0;const {exports,storage}=load(built,()=>{calls++;throw Error('network')});
  storage.set('sp-live-refresh-token','production-token');
  const api=exports.createAPI(()=>{},fake);assert.equal(await api.restore(),null);assert.equal(calls,0);assert.equal(storage.get('sp-live-refresh-token'),'production-token');
});
