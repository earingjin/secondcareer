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
  const tables={user_profiles:profiles,organizations:[{id:ids.org,name:'테스트 기업'}],server_login_lookup:profiles.map(p=>({user_id:p.user_id,login_id:loginIds[p.user_id],internal_email:users[p.user_id].email})),participant_registration_requests:[],participants:[{id:'existing-participant',auth_user_id:ids.participant,counselor_user_id:ids.counselor,organization_id:ids.org,display_name:'기존참여자',company_name:'테스트기업'}],assessments:[],assessment_history:[]};
  // pageSize caps each read like the Data API row limit; reads/failReadsOf record and fail reads per table.
  tables.counselor_registration_requests=[];tables.client_companies=[];tables.client_company_counselors=[];tables.company_manager_accounts=[];tables.company_manager_access=[];tables.company_manager_registration_requests=[];
  const state={tables,users,created:[],updated:[],enabled:true,postEnabled:false,managerEnabled:false,pageSize:Infinity,reads:[],writes:[],failWritesOf:null,failReadsOf:null,failCreate:false,failComplete:false,failProfile:false,failUpdate:false,companyClock:0};
  const db={from(name){
    let filters=[],insert=null,update=null,columns=null,order=null,limit=Infinity,range=null,orders=[],selectOptions={},deleting=false;
    const q={delete(){deleting=true;return q},select(c,o={}){columns=c;selectOptions=o;return q},is(k,v){filters.push([k,v,'is']);return q},eq(k,v){filters.push([k,v,'eq']);return q},in(k,v){filters.push([k,[...v],'in']);return q},gt(k,v){filters.push([k,v,'gt']);return q},ilike(k,v){filters.push([k,v,'ilike']);return q},order(k,o){order=k;orders.push([k,o?.ascending!==false]);return q},limit(n){limit=n;return q},range(a,b){range=[a,b];return q},insert(row){insert=row;return q},update(row){update=row;return q},async single(){const result=await run(true);return result.data?result:{...result,error:result.error||{code:'PGRST116'}}},async maybeSingle(){return run(true)},then(resolve,reject){return run(false).then(resolve,reject)}};
    const match=(r,[k,v,op])=>op==='is'?(r[k]??null)===v:op==='in'?v.includes(r[k]):op==='gt'?r[k]>v:r[k]===v;
    async function run(single){
      if(name==='user_profiles'&&state.failProfile)return {error:{code:'QUERY_ERROR'},data:null};
      if(!tables[name])return {error:{code:'MISSING_TABLE'},data:null};
      if(name==='counselor_registration_requests'){
        if(insert){
          if(state.failCounselorReserve)return {error:{code:'QUERY_ERROR'}};
          if(tables[name].some(r=>r.id===insert.id||r.login_id===insert.login_id))return {error:{code:'23505'}};
          tables[name].push({...insert,status:'pending'});return {error:null};
        }
      }
      if(name.startsWith('company_manager_')){
        const operation=insert?'insert':update?'update':deleting?'delete':'select';
        (operation==='select'?state.reads:state.writes).push({table:name,operation,columns,filters:filters.map(f=>[...f])});
        if(operation==='select'?state.failReadsOf===name:state.failWritesOf===name)return {data:null,error:{code:'QUERY_ERROR'}};
        let rows=tables[name].filter(r=>filters.every(f=>match(r,f)));
        if(insert){
          if(name==='company_manager_registration_requests'&&tables[name].some(r=>r.id===insert.id||r.login_id===insert.login_id||r.organization_id===insert.organization_id&&r.email.toLowerCase()===insert.email.toLowerCase()))return {error:{code:'23505'},data:null};
          if(name==='company_manager_access'){
            if(!tables.client_companies.some(c=>c.organization_id===insert.organization_id&&c.id===insert.company_id)||!tables.company_manager_accounts.some(a=>a.organization_id===insert.organization_id&&a.user_id===insert.manager_user_id))return {error:{code:'23503'},data:null};
            if(tables[name].some(r=>r.organization_id===insert.organization_id&&r.company_id===insert.company_id&&r.manager_user_id===insert.manager_user_id))return {error:{code:'23505'},data:null};
          }
          const row={...insert,created_at:'2026-11-06T00:00:00Z',...(name==='company_manager_registration_requests'?{status:'pending'}:{})};tables[name].push(row);rows=[row];
        }else if(update)rows.forEach(r=>Object.assign(r,update));
        else if(deleting)tables[name]=tables[name].filter(r=>!rows.includes(r));
        else{if(order)rows=[...rows].sort((a,b)=>a[order]<b[order]?-1:a[order]>b[order]?1:0);rows=rows.slice(0,Math.min(limit,state.pageSize))}
        const data=rows.map(r=>Object.fromEntries((columns||'').split(',').filter(Boolean).map(k=>[k,r[k]])));
        return {error:null,data:single?(data[0]||null):data};
      }
      if(name==='client_company_counselors'){
        const operation=insert?'insert':deleting?'delete':'select',log={table:name,operation,columns,filters:filters.map(f=>[...f])};
        (operation==='select'?state.reads:state.writes).push(log);
        if(operation==='select'?state.failReadsOf===name:state.failWritesOf===name)return {error:{code:'QUERY_ERROR'},data:null};
        if(operation!=='select'&&state.beforeAssignmentWrite)state.beforeAssignmentWrite();
        let rows=tables[name].filter(r=>filters.every(f=>match(r,f)));
        if(insert){
          if(!tables.client_companies.some(c=>c.id===insert.company_id&&c.organization_id===insert.organization_id)||!tables.user_profiles.some(c=>c.user_id===insert.counselor_user_id&&c.organization_id===insert.organization_id&&c.role==='counselor'))return {error:{code:'23503'},data:null};
          if(tables[name].some(r=>r.organization_id===insert.organization_id&&r.company_id===insert.company_id&&r.counselor_user_id===insert.counselor_user_id))return {error:{code:'23505'},data:null};
          const row={...insert,created_at:'2026-11-06T00:00:00Z'};tables[name].push(row);rows=[row];
        }else if(deleting){tables[name]=tables[name].filter(r=>!rows.includes(r))}
        else{if(order)rows=[...rows].sort((a,b)=>a[order]<b[order]?-1:a[order]>b[order]?1:0);rows=rows.slice(0,Math.min(limit,state.pageSize))}
        if(state.assignmentNoReturn&&operation!=='select')return {data:null,error:null};
        const data=rows.map(r=>Object.fromEntries(columns.split(',').map(k=>[k,r[k]])));
        return {data:single?(data[0]||null):data,error:null};
      }
      if(name==='client_companies'){
        // Protocol model only: pagination, projection, scoped writes, DB unique-name race.
        const nameKey=s=>s.trim().replace(/\s+/g,' ').replace(/[A-Z]/g,c=>c.toLowerCase());
        const like=(s,pattern)=>{let source='';for(let i=0;i<pattern.length;i++){let c=pattern[i];if(c==='\\'&&i+1<pattern.length){c=pattern[++i];source+=c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}else source+=c==='%'?'.*':c==='_'?'.':c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}return new RegExp('^'+source+'$','iu').test(s)};
        const matches=r=>filters.every(f=>f[2]==='ilike'?like(r[f[0]],f[1]):match(r,f));
        const log={table:name,columns,filters:filters.map(f=>[...f]),range};
        if(insert||update)state.writes.push({...log,operation:insert?'insert':'update'});else state.reads.push(log);
        if((insert||update)&&state.failWritesOf===name||!insert&&!update&&state.failReadsOf===name)return {error:{code:'QUERY_ERROR'},data:null};
        let rows=tables[name].filter(matches);
        const nextTime=()=>new Date(Date.UTC(2026,10,6,0,0,0,++state.companyClock)).toISOString();
        if(insert){
          if(tables[name].some(r=>r.organization_id===insert.organization_id&&nameKey(r.name)===nameKey(insert.name)))return {error:{code:'23505'},data:null};
          const t=nextTime(),row={...insert,id:webcrypto.randomUUID(),status:'active',created_at:t,updated_at:t};tables[name].push(row);rows=[row];
        }else if(update){
          if(rows.some(row=>tables[name].some(r=>r.id!==row.id&&r.organization_id===row.organization_id&&nameKey(r.name)===nameKey(update.name??row.name))))return {error:{code:'23505'},data:null};
          rows.forEach(row=>Object.assign(row,update,{updated_at:nextTime()}));
        }
        const count=rows.length;
        for(const [key,ascending] of [...orders].reverse())rows=[...rows].sort((a,b)=>(a[key]<b[key]?-1:a[key]>b[key]?1:0)*(ascending?1:-1));
        if(range&&!single)rows=rows.slice(range[0],range[1]+1);
        const data=rows.map(r=>Object.fromEntries(columns.split(',').map(k=>[k,r[k]])));
        return {error:null,data:state.companyNoReturn&&(insert||update)?null:single?(data[0]||null):data,count};
      }
      if(insert){
        if(name==='participant_registration_requests'&&tables[name].some(r=>r.id===insert.id||r.login_id===insert.login_id))return {error:{code:'23505'}};
        tables[name].push({...insert});return {error:null,data:null};
      }
      if(!update)state.reads.push({table:name,columns,filters:filters.map(f=>[...f])});
      if(!update&&state.failReadsOf===name)return {data:null,error:{code:'QUERY_ERROR'}};
      let rows=tables[name].filter(r=>filters.every(f=>match(r,f)));
      const count=rows.length;
      if(update)rows.forEach(row=>Object.assign(row,update));
      if(single&&rows.length>1)return {data:null,error:{code:'MULTIPLE_ROWS'}};
      if(order)rows=[...rows].sort((a,b)=>a[order]<b[order]?-1:a[order]>b[order]?1:0);
      if(!single&&!update){if(range)rows=rows.slice(range[0],range[0]+Math.min(range[1]-range[0]+1,state.pageSize));else rows=rows.slice(0,Math.min(limit,state.pageSize));}
      // A real select returns only the requested columns.
      // Also models PostgREST JSON paths: 'alias:column->key(->key...)' returns {alias: column[key]...}
      // (missing parts give null, as a JSON path does).
      const pick=(r,spec)=>{const m=/^(?:(\w+):)?(\w+)((?:->\w+)+)$/.exec(spec);if(!m)return [spec,r[spec]];const keys=m[3].slice(2).split('->');return [m[1]||keys[keys.length-1],keys.reduce((v,k)=>v?.[k],r[m[2]])??null]};
      if(columns&&!update)rows=rows.map(r=>Object.fromEntries(columns.split(',').map(k=>pick(r,k))));
      return {data:selectOptions.head?null:single?(rows[0]||null):rows,error:null,...(selectOptions.count?{count}:{})};
    }
    return q;
  },auth:{getUser:async token=>({data:{user:users[token]||null},error:null}),admin:{
    async createUser(input){
      if(state.failCreate)return {data:{user:null},error:{message:'private upstream error'}};
      if(Object.values(users).some(u=>u.email===input.email))return {data:{user:null},error:{message:'Email already exists'}};
      const user={id:webcrypto.randomUUID(),email:input.email,app_metadata:{...input.app_metadata}};
      users[user.id]=user;credentials.set(user.id,input.password);state.created.push({...input,id:user.id});return {data:{user},error:null};
    },
    async deleteUser(id){
      if(state.failDelete)return {error:{code:'DELETE_FAILED'}};
      if(!state.created.some(u=>u.id===id)||tables.user_profiles.some(p=>p.user_id===id))throw Error('Unsafe Auth cleanup');
      delete users[id];credentials.delete(id);(state.deleted??=[]).push(id);return {error:null};
    },
    async updateUserById(id,input){
      if(state.failUpdate)return {data:{user:null},error:{message:'private upstream error'}};
      state.updated.push({id,...input});credentials.set(id,input.password);users[id].app_metadata={...input.app_metadata};return {data:{user:users[id]},error:null};
    }
  }},async rpc(name,args){
    if(name==='secondcareer_complete_counselor_registration'){
      if(state.throwCounselorComplete)throw Error('transport failure');
      if(state.failCounselorComplete)return {error:{code:'COMPLETE_FAILED'}};
      const r=tables.counselor_registration_requests.find(r=>r.id===args.request_id),u=users[args.new_user_id];
      if(!r||!u||u.email!==args.new_internal_email||u.app_metadata.registration_request_id!==r.id||u.app_metadata.must_change_password!==true||!tables.user_profiles.some(p=>p.user_id===r.actor_user_id&&p.role==='admin'&&p.organization_id===r.organization_id))return {error:{code:'FORBIDDEN'}};
      if(r.status==='complete')return r.auth_user_id===args.new_user_id?{data:{counselorId:r.auth_user_id,loginId:r.login_id},error:null}:{error:{code:'CONFLICT'}};
      if(tables.server_login_lookup.some(l=>l.login_id===r.login_id||l.user_id===u.id||l.internal_email===u.email)||tables.user_profiles.some(p=>p.user_id===u.id))return {error:{code:'23505'}};
      tables.user_profiles.push({user_id:u.id,organization_id:r.organization_id,role:'counselor',display_name:r.display_name});
      tables.server_login_lookup.push({user_id:u.id,login_id:r.login_id,internal_email:u.email});r.status='complete';r.auth_user_id=u.id;
      return state.loseCounselorResponse?{error:{code:'LOST'}}:{data:{counselorId:u.id,loginId:r.login_id},error:null};
    }
    if(name==='secondcareer_manager_password_changed'){
      if(state.failManagerPassword)return {error:{code:'PASSWORD_DB_FAILED'}};
      const a=tables.company_manager_accounts.find(a=>a.user_id===args.manager_user_id&&a.status==='active');
      if(!a||users[a.user_id].app_metadata.must_change_password!==false)return {error:{code:'INVALID_STATE'}};
      a.must_change_password=false;return {data:true,error:null};
    }
    if(name==='secondcareer_complete_manager_registration'||name==='secondcareer_recover_manager_registration'){
      const r=tables.company_manager_registration_requests.find(r=>r.id===args.request_id);
      if(!r)return {error:{code:'MISSING_REQUEST'}};
      if(name==='secondcareer_recover_manager_registration'){
        if(state.failManagerRecovery)return {error:{code:'RECOVERY_FAILED'}};
        if(r.status==='complete'&&r.auth_user_id===args.new_user_id)return {data:{outcome:'complete',managerId:r.auth_user_id,loginId:r.login_id},error:null};
        if(r.status!=='pending')return {error:{code:'CONFLICT'}};
        r.status='cancelled';r.auth_user_id=args.new_user_id;return {data:{outcome:'cancelled'},error:null};
      }
      if(state.failManagerComplete)return {error:{code:'COMPLETE_FAILED'}};
      if(r.status!=='pending'||!tables.client_companies.some(c=>c.id===r.company_id&&c.organization_id===r.organization_id)||!tables.user_profiles.some(p=>p.user_id===r.actor_user_id&&p.role==='admin'&&p.organization_id===r.organization_id))return {error:{code:'FORBIDDEN'}};
      tables.user_profiles.push({user_id:args.new_user_id,organization_id:r.organization_id,role:'company_manager',display_name:r.display_name});
      tables.server_login_lookup.push({user_id:args.new_user_id,login_id:r.login_id,internal_email:args.new_internal_email});
      tables.company_manager_accounts.push({user_id:args.new_user_id,organization_id:r.organization_id,email:r.email,phone:r.phone,status:'active',must_change_password:true});
      tables.company_manager_access.push({organization_id:r.organization_id,company_id:r.company_id,manager_user_id:args.new_user_id});
      r.status='complete';r.auth_user_id=args.new_user_id;
      return state.loseManagerResponse?{error:{code:'LOST'}}:{data:{managerId:args.new_user_id,loginId:r.login_id},error:null};
    }
    const r=tables.participant_registration_requests.find(r=>r.id===args.request_id);
    if(name==='secondcareer_recover_company_registration'){
      if(state.failRecovery)return {error:{code:'RECOVERY_FAILED'}};
      if(r.status==='complete'&&r.auth_user_id===args.new_user_id)return {data:{outcome:'complete',participantId:r.participant_id,companyId:r.company_id,companyName:r.company_name},error:null};
      if(r.status==='complete'||users[args.new_user_id]?.app_metadata.registration_request_id!==r.id||tables.user_profiles.some(p=>p.user_id===args.new_user_id))return {error:{code:'UNSAFE_RECOVERY'}};
      r.company_cancelled_auth_user_id=args.new_user_id;return {data:{outcome:'cancelled'},error:null};
    }
    const linked=name==='secondcareer_complete_company_registration';
    if(!linked&&name!=='secondcareer_complete_registration')throw Error('Unexpected RPC');
    if(linked&&state.beforeCompanyCompletion)state.beforeCompanyCompletion();
    if(state.failComplete)return {error:{message:'private upstream error'}};
    const company=linked&&tables.client_companies.find(c=>c.id===r.company_id&&c.organization_id===r.organization_id&&c.status==='active');
    if(linked&&(!company||r.company_cancelled_auth_user_id||r.status==='complete'))return {error:{code:'COMPANY_UNAVAILABLE'}};
    if(linked)r.company_name=company.name;
    const id=webcrypto.randomUUID();
    tables.user_profiles.push({user_id:args.new_user_id,organization_id:r.organization_id,role:'participant',display_name:r.display_name});
    tables.server_login_lookup.push({user_id:args.new_user_id,login_id:r.login_id,internal_email:args.new_internal_email});
    tables.participants.push({id,organization_id:r.organization_id,auth_user_id:args.new_user_id,counselor_user_id:r.counselor_user_id,display_name:r.display_name,phone:r.phone,company_name:r.company_name,...(linked?{company_id:r.company_id}:{})});
    r.status='complete';r.auth_user_id=args.new_user_id;r.participant_id=id;
    if(linked&&state.loseCompanyResponse)return {error:{code:'RESPONSE_LOST'}};
    return {data:linked?{participantId:id,companyId:r.company_id,companyName:r.company_name}:id,error:null};
  }};
  // Login endpoint protocol model, including its private rate-limit table.
  tables.login_attempt_limits=[];
  const originalFrom=db.from;
  db.from=function(name){
    if(name!=='login_attempt_limits')return originalFrom.call(db,name);
    let hash=null;
    const q={select(){return q},eq(k,v){hash=v;return q},async maybeSingle(){return {data:tables.login_attempt_limits.find(r=>r.login_hash===hash)||null,error:null}},async upsert(row){tables.login_attempt_limits=tables.login_attempt_limits.filter(r=>r.login_hash!==row.login_hash);tables.login_attempt_limits.push({...row});return {error:null}},delete(){return q},then(resolve){tables.login_attempt_limits=tables.login_attempt_limits.filter(r=>r.login_hash!==hash);return Promise.resolve({error:null}).then(resolve)}};
    return q;
  };
  db.auth.signInWithPassword=async({email,password})=>{
    const u=Object.values(users).find(u=>u.email===email&&credentials.get(u.id)===password);
    return u?{data:{user:u,session:{access_token:u.id,refresh_token:'refresh-'+u.id,expires_at:Math.floor(Date.now()/1000)+3600}},error:null}:{data:{},error:{code:'INVALID'}};
  };
  const cache=new Map(),root=path.resolve('supabase/functions');
  const context=vm.createContext({Request,Response,URL,TextEncoder,TextDecoder,Uint8Array,btoa,crypto:webcrypto,Deno:{env:{get:key=>key==='SECONDCAREER_COUNSELOR_REGISTRATION_ENABLED'?(state.counselorEnabled?'true':'false'):key==='SECONDCAREER_COMPANY_MANAGER_ENABLED'?(state.managerEnabled?'true':'false'):key==='SECONDCAREER_REGISTRATION_ENABLED'?(state.enabled?'true':'false'):key==='SECONDCAREER_POST_DRAFT_ENABLED'?(state.postEnabled?'true':'false'):'fixture'},serve:f=>{served=f}}});
  let served=null;
  function load(filename){
    filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename).exports;
    const module={exports:{}};cache.set(filename,module);
    const code=transformSync(fs.readFileSync(filename,'utf8'),{loader:filename.endsWith('.ts')?'ts':'js',format:'cjs',target:'es2022'}).code;
    const requireMock=specifier=>specifier.startsWith('npm:')?{createClient:()=>db}:load(path.resolve(path.dirname(filename),specifier));
    vm.runInContext('(function(require,module,exports){'+code+'\n})',context,{filename})(requireMock,module,module.exports);
    return module.exports;
  }
  load(path.join(root,'secondcareer-login/index.ts'));const login=served;
  const registration=load(path.join(root,'secondcareer-register-participant/index.ts'));
  const account=load(path.join(root,'secondcareer-account/index.ts'));
  const access=load(path.join(root,'_shared/participant-access.ts'));
  const progress=load(path.join(root,'secondcareer-admin-progress/index.ts'));
  const directory=load(path.join(root,'secondcareer-admin-directory/index.ts'));
  const adminReport=load(path.join(root,'secondcareer-admin-report/index.ts'));
  const aggregate=load(path.join(root,'secondcareer-admin-aggregate/index.ts'));
  const companies=load(path.join(root,'secondcareer-admin-companies/index.ts'));
  const counselors=load(path.join(root,'secondcareer-admin-counselors/index.ts'));
  const managers=load(path.join(root,'secondcareer-admin-company-managers/index.ts'));
  const manager=load(path.join(root,'secondcareer-company-manager/index.ts'));
  const managerProgress=load(path.join(root,'secondcareer-company-manager-progress/index.ts'));
  // The counselor assessment function has no exported handler; take the one it passes to Deno.serve.
  load(path.join(root,'secondcareer-assessment/index.ts'));const assessment=served;
  async function call(handler,token,body,method=body?'POST':'GET',url='https://fixture.invalid/'){
    const response=await handler(new Request(url,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
    return {status:response.status,headers:response.headers,data:await response.json()};
  }
  function signIn(loginId,password){
    const mapping=tables.server_login_lookup.find(m=>m.login_id===loginId);
    const user=mapping&&Object.values(users).find(u=>u.email===mapping.internal_email);
    return user&&user.id===mapping.user_id&&credentials.get(user.id)===password?user:null;
  }
  return {state,ids,login,registration,account,access,progress,directory,adminReport,aggregate,companies,counselors,managers,manager,managerProgress,assessment,call,signIn};
}
module.exports={harness,ids};
