// One-off administrator tool. Never import into the browser bundle.
const fs=require('node:fs'), path=require('node:path'), readline=require('node:readline');
const {createParticipant,rotatePassword,validatePlan}=require('./account-operations.cjs');
const base='https://tafrbtqjlrokdnhudswb.supabase.co';
function hidden(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('Interactive terminal required');
  return new Promise((resolve,reject)=>{
    process.stdout.write(label); let value=''; const input=process.stdin;
    input.setRawMode(true); input.resume(); input.setEncoding('utf8');
    function done(error){input.removeListener('data',onData);input.setRawMode(false);input.pause();process.stdout.write('\n');error?reject(error):resolve(value)}
    function onData(chunk){for(const ch of chunk){if(ch==='\u0003')return done(Error('Cancelled'));if(ch==='\r'||ch==='\n')return done();if(ch==='\u007f'||ch==='\b')value=value.slice(0,-1);else if(ch>=' '&&ch<='~')value+=ch}}
    input.on('data',onData);
  });
}
function answer(prompt){const rl=readline.createInterface({input:process.stdin,output:process.stdout});return new Promise(r=>rl.question(prompt,s=>{rl.close();r(s)}))}
function client(key){
  async function request(url,method='GET',body){
    let r;try{r=await fetch(base+url,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(method==='POST'&&url.startsWith('/rest/')?{Prefer:'return=minimal'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});}catch{throw Error('Network error; operation outcome may be unknown')}
    if(!r.ok)throw Error('Server rejected request (HTTP '+r.status+'); operation outcome may require inspection');
    if(r.status===204)return null;const text=await r.text();if(!text)return null;try{return JSON.parse(text)}catch{throw Error('Invalid server response; operation outcome may be unknown')}
  }
  return {
    get:(table,filters)=>{const q=new URLSearchParams({select:'*'});for(const [k,v] of Object.entries(filters))q.set(k,'eq.'+v);return request('/rest/v1/'+table+'?'+q)},
    insert:(table,row)=>request('/rest/v1/'+table,'POST',row),
    getUser:id=>request('/auth/v1/admin/users/'+encodeURIComponent(id)),
    createUser:(email,password)=>request('/auth/v1/admin/users','POST',{email,password,email_confirm:true}),
    updatePassword:(id,password)=>request('/auth/v1/admin/users/'+encodeURIComponent(id),'PUT',{password})
  };
}
function journal(loginId){
  // .env.* is ignored by Git and, unlike test-results, is not cleared by Playwright.
  const filename=path.resolve('.env.sp-admin-'+loginId+'.json');
  return {create:async s=>fs.writeFileSync(filename,JSON.stringify(s,null,2),{flag:'wx',mode:0o600}),update:async s=>{const temp=filename+'.tmp';fs.writeFileSync(temp,JSON.stringify(s,null,2),{flag:'wx',mode:0o600});fs.renameSync(temp,filename)}};
}
async function main(){
  const [mode,...args]=process.argv.slice(2);let plan;
  if(mode==='create' && args.length===4){plan=validatePlan({organizationId:args[0],counselorId:args[1],loginId:args[2],displayName:args[3]});}
  else if(mode==='rotate' && args.length===3){plan={userId:args[0],role:args[1],loginId:args[2]};if(!/^[0-9a-f-]{36}$/i.test(plan.userId)||!['participant','counselor'].includes(plan.role)||!/^[a-z0-9][a-z0-9_-]{5,31}$/.test(plan.loginId))throw Error('Invalid target');}
  else throw Error('Usage: node src/admin/account-cli.cjs create <organization-id> <counselor-id> <login-id> <TEST-name> OR rotate <user-id> <participant|counselor> <login-id>');
  console.log(JSON.stringify({project:base,operation:mode,target:plan,impact:mode==='create'?'Create one Auth user, profile, login mapping and participant; no assessment changes':'Update the password of the specified Auth user; existing access tokens may remain valid until expiry'},null,2));
  if(await answer('Type APPROVED to execute after user authorization: ')!=='APPROVED')throw Error('Cancelled');
  const key=await hidden('Service role key (hidden): ');const password=await hidden('New password (hidden): ');const verify=await hidden('Repeat password (hidden): ');
  if(password!==verify)throw Error('Passwords differ');
  const api=client(key);
  if(mode==='create'){const result=await createParticipant(api,plan,password,journal(plan.loginId));console.log('Created test participant. Journal:',path.resolve('.env.sp-admin-'+plan.loginId+'.json'),'participant ID:',result.participantId);}
  else {await rotatePassword(api,plan,password);console.log('Password update accepted. Review and revoke existing sessions separately; access tokens can remain usable until expiry.');}
}
if(require.main===module)main().catch(e=>{console.error('Operation stopped:',e.message);process.exitCode=1});
