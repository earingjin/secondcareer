// Local protocol mock, not a substitute for Postgres/Auth integration tests.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {transformSync}=require('esbuild');
const {webcrypto}=require('node:crypto');
const ids={counselor:'10000000-0000-4000-8000-000000000001',admin:'10000000-0000-4000-8000-000000000002',participant:'10000000-0000-4000-8000-000000000003',other:'10000000-0000-4000-8000-000000000004',org:'20000000-0000-4000-8000-000000000001'};
function harness(){
  const profiles=[{user_id:ids.counselor,organization_id:ids.org,role:'counselor',display_name:'상담사'},{user_id:ids.admin,organization_id:ids.org,role:'admin',display_name:'관리자'},{user_id:ids.participant,organization_id:ids.org,role:'participant',display_name:'참여자'},{user_id:ids.other,organization_id:'other-org',role:'counselor',display_name:'다른 조직'}];
  const users=Object.fromEntries(profiles.map(p=>[p.user_id,{id:p.user_id,email:`fixture-${p.user_id}@example.invalid`,app_metadata:{}}]));
  const credentials=new Map(profiles.map(p=>[p.user_id,'Fixture-password-123!']));
  const loginIds={[ids.counselor]:'consult01',[ids.admin]:'admin01',[ids.participant]:'client01',[ids.other]:'other01'};
  const tables={user_profiles:profiles,organizations:[{id:ids.org,name:'테스트 기업'}],server_login_lookup:profiles.map(p=>({user_id:p.user_id,login_id:loginIds[p.user_id],internal_email:users[p.user_id].email})),participant_registration_requests:[],participants:[{id:'existing-participant',auth_user_id:ids.participant,counselor_user_id:ids.counselor,organization_id:ids.org,display_name:'기존참여자',company_name:'테스트기업'}]};
  const state={tables,users,created:[],updated:[],enabled:true,failCreate:false,failComplete:false,failProfile:false,failUpdate:false};
  const db={from(name){
    let filters=[],insert=null;
    const q={select(){return q},eq(k,v){filters.push([k,v]);return q},insert(row){insert=row;return q},async maybeSingle(){return run(true)},then(resolve,reject){return run(false).then(resolve,reject)}};
    async function run(single){
      if(name==='user_profiles'&&state.failProfile)return {error:{code:'QUERY_ERROR'},data:null};
      if(!tables[name])return {error:{code:'MISSING_TABLE'},data:null};
      if(insert){
        if(name==='participant_registration_requests'&&tables[name].some(r=>r.id===insert.id||r.login_id===insert.login_id))return {error:{code:'23505'}};
        tables[name].push({...insert});return {error:null,data:null};
      }
      const rows=tables[name].filter(r=>filters.every(([k,v])=>r[k]===v));
      if(single&&rows.length>1)return {data:null,error:{code:'MULTIPLE_ROWS'}};
      return {data:single?(rows[0]||null):rows,error:null};
    }
    return q;
  },auth:{getUser:async token=>({data:{user:users[token]||null},error:null}),admin:{
    async createUser(input){
      if(state.failCreate)return {data:{user:null},error:{message:'private upstream error'}};
      if(Object.values(users).some(u=>u.email===input.email))return {data:{user:null},error:{message:'Email already exists'}};
      const user={id:webcrypto.randomUUID(),email:input.email,app_metadata:{...input.app_metadata}};
      users[user.id]=user;credentials.set(user.id,input.password);state.created.push({...input,id:user.id});return {data:{user},error:null};
    },
    async updateUserById(id,input){
      if(state.failUpdate)return {data:{user:null},error:{message:'private upstream error'}};
      state.updated.push({id,...input});credentials.set(id,input.password);users[id].app_metadata={...input.app_metadata};return {data:{user:users[id]},error:null};
    }
  }},async rpc(name,args){
    if(state.failComplete)return {error:{message:'private upstream error'}};
    if(name!=='secondcareer_complete_registration')throw Error('Unexpected RPC');
    const r=tables.participant_registration_requests.find(r=>r.id===args.request_id);
    const id=webcrypto.randomUUID();
    tables.user_profiles.push({user_id:args.new_user_id,organization_id:r.organization_id,role:'participant',display_name:r.display_name});
    tables.server_login_lookup.push({user_id:args.new_user_id,login_id:r.login_id,internal_email:args.new_internal_email});
    tables.participants.push({id,organization_id:r.organization_id,auth_user_id:args.new_user_id,counselor_user_id:r.counselor_user_id,display_name:r.display_name,phone:r.phone,company_name:r.company_name});
    r.status='complete';r.auth_user_id=args.new_user_id;r.participant_id=id;
    return {data:id,error:null};
  }};
  const cache=new Map(),root=path.resolve('supabase/functions');
  const context=vm.createContext({Request,Response,TextEncoder,TextDecoder,Uint8Array,btoa,crypto:webcrypto,Deno:{env:{get:key=>key==='SECONDCAREER_REGISTRATION_ENABLED'?(state.enabled?'true':'false'):'fixture'},serve:()=>{}}});
  function load(filename){
    filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename).exports;
    const module={exports:{}};cache.set(filename,module);
    const code=transformSync(fs.readFileSync(filename,'utf8'),{loader:'ts',format:'cjs',target:'es2022'}).code;
    const requireMock=specifier=>specifier.startsWith('npm:')?{createClient:()=>db}:load(path.resolve(path.dirname(filename),specifier));
    vm.runInContext('(function(require,module,exports){'+code+'\n})',context,{filename})(requireMock,module,module.exports);
    return module.exports;
  }
  const registration=load(path.join(root,'secondcareer-register-participant/index.ts'));
  const account=load(path.join(root,'secondcareer-account/index.ts'));
  const access=load(path.join(root,'_shared/participant-access.ts'));
  async function call(handler,token,body,method=body?'POST':'GET'){
    const response=await handler(new Request('https://fixture.invalid/',{method,headers:{...(token?{authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
    return {status:response.status,headers:response.headers,data:await response.json()};
  }
  function signIn(loginId,password){
    const mapping=tables.server_login_lookup.find(m=>m.login_id===loginId);
    const user=mapping&&Object.values(users).find(u=>u.email===mapping.internal_email);
    return user&&user.id===mapping.user_id&&credentials.get(user.id)===password?user:null;
  }
  return {state,ids,registration,account,access,call,signIn};
}
module.exports={harness,ids};
