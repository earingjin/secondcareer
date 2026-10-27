// Read only: never create accounts, submit fixture answers, or print secrets.
const assert=require('node:assert/strict');
const {loadEnv}=require('vite');
const base='https://tafrbtqjlrokdnhudswb.supabase.co';
const key='sb_publishable_va6hVj1FwfrxMiD6IQb81Q_AWE5m0-8';
(async()=>{
  const env=loadEnv('development',process.cwd(),'SECONDCAREER_');
  let clientParticipant=null;
  for(const [id,role,name] of [['client01','participant','SECONDCAREER_CLIENT_PASSWORD'],['consult01','counselor','SECONDCAREER_COUNSELOR_PASSWORD']]){
    const password=process.env[name]||env[name];
    if(!password){console.log('UNVERIFIED',id,'local credential not configured');continue}
    let token;
    try{
      const login=await fetch(base+'/functions/v1/secondcareer-login',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({loginId:id,password}),signal:AbortSignal.timeout(20000)});
      assert.equal(login.status,200,id+' login status');const session=await login.json();token=session.access_token;assert.ok(token);
      const headers={apikey:key,authorization:'Bearer '+token};
      const read=await fetch(base+'/functions/v1/secondcareer-assessment',{headers,signal:AbortSignal.timeout(20000)});assert.equal(read.status,200,id+' read status');
      const data=await read.json();assert.equal(data.profile.role,role);assert.ok(Array.isArray(data.participants));
      assert.ok(data.participants.length>0,id+' provisioned participant access');
      if(role==='participant')clientParticipant=data.participants[0].id;
      if(role==='counselor')assert.ok(data.participants.some(p=>p.id===clientParticipant),'assigned counselor can read the authenticated client');
      if(role==='participant'&&data.participants.length){const report=await fetch(base+'/functions/v1/secondcareer-assessment?id='+data.participants[0].id,{headers,signal:AbortSignal.timeout(20000)});assert.equal(report.status,403,'participant report access denied')}
      const direct=await fetch(base+'/rest/v1/assessments?select=result',{headers,signal:AbortSignal.timeout(20000)});assert.ok([401,403].includes(direct.status),'direct result column denied');
      console.log('PASS',id,'authentication, expected role and authorized participant read');
    }finally{if(token){const logout=await fetch(base+'/auth/v1/logout',{method:'POST',headers:{apikey:key,authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});assert.equal(logout.status,204,id+' logout status')}}
  }
})().catch(error=>{console.error(error.message);process.exitCode=1});
