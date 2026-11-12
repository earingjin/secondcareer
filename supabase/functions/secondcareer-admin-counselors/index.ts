import {APIError,failure,headers,readBody,secretDigest} from '../_shared/registration-http.ts';
import {authenticateAdmin,chunks,readAll} from '../_shared/admin-access.ts';
import {generateTemporaryPassword} from '../_shared/temporary-password.ts';

const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function handleAdminCounselors(req:Request){
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','POST'].includes(req.method))return reply({error:'METHOD_NOT_ALLOWED'},405);
  try{
    const {admin,profile,user}=await authenticateAdmin(req);
    if(req.method==='GET'){
      const profiles=await readAll(()=>admin.from('user_profiles').select('user_id,display_name').eq('organization_id',profile.organization_id).eq('role','counselor'),'user_id');
      const mappings=new Map<string,string>(),loginIds=new Set<string>();
      for(const ids of chunks(profiles.map(p=>p.user_id),100)){
        const allowed=new Set(ids);let offset=0;
        // Offset pagination is deliberate: keyset pagination by user_id alone
        // can silently skip duplicate mappings at a page boundary.
        for(;;){
          const {data,error}=await admin.from('server_login_lookup').select('user_id,login_id').in('user_id',ids)
            .order('user_id',{ascending:true}).order('login_id',{ascending:true}).range(offset,offset+99);
          if(error||!Array.isArray(data))throw new APIError('COUNSELOR_QUERY_FAILED',503);
          if(!data.length)break;
          for(const m of data){
            if(!allowed.has(m.user_id)||mappings.has(m.user_id)||typeof m.login_id!=='string'||
              !/^[a-z0-9][a-z0-9_-]{5,31}$/.test(m.login_id)||loginIds.has(m.login_id))throw new APIError('COUNSELOR_QUERY_FAILED',503);
            mappings.set(m.user_id,m.login_id);loginIds.add(m.login_id);
          }
          offset+=data.length;
        }
      }
      const counselors=profiles.map(p=>({id:p.user_id,name:p.display_name||p.user_id,loginId:mappings.get(p.user_id)||null}));
      return reply({counselors,registrationAvailable:Deno.env.get('SECONDCAREER_COUNSELOR_REGISTRATION_ENABLED')==='true'});
    }
    // Enable only after the proposal, password gates, RPC permissions and Auth
    // hooks have been verified. Never fall back to non-atomic profile inserts.
    if(Deno.env.get('SECONDCAREER_COUNSELOR_REGISTRATION_ENABLED')!=='true')throw new APIError('COUNSELOR_NOT_CONFIGURED',503);
    const b=await readBody(req),name=typeof b.name==='string'?b.name.trim():'',loginId=typeof b.loginId==='string'?b.loginId.trim().toLowerCase():'';
    if(Object.keys(b).some(k=>!['name','loginId','requestId'].includes(k))||!uuid(b.requestId)||!name||name.length>100||!/^\S(?:[\s\S]*\S)?$/.test(name)||/[\u0000-\u001f\u007f]/.test(name)||!/^[a-z0-9][a-z0-9_-]{5,31}$/.test(loginId))throw new APIError('INVALID_REQUEST');
    const {data:existing,error:lookupError}=await admin.from('server_login_lookup').select('user_id').eq('login_id',loginId).maybeSingle();
    if(lookupError)throw new APIError('COUNSELOR_QUERY_FAILED',503);
    if(existing)throw new APIError('LOGIN_ID_UNAVAILABLE',409);
    const requestId=b.requestId.toLowerCase();
    const {error:reserveError}=await admin.from('counselor_registration_requests').insert({id:requestId,actor_user_id:user.id,organization_id:profile.organization_id,login_id:loginId,display_name:name});
    if(reserveError)throw new APIError(reserveError.code==='23505'?'COUNSELOR_ALREADY_REQUESTED':'COUNSELOR_NOT_CONFIGURED',reserveError.code==='23505'?409:503);
    const password=generateTemporaryPassword(),email='sp-'+await secretDigest(loginId)+'@accounts.example.invalid';
    // After reservation any transport error is ambiguous. Do not release the
    // reservation, delete Auth, create again, log a password or disclose it.
    try{
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{must_change_password:true,temporary_password_digest:await secretDigest(password),registration_request_id:requestId}});
      if(created.error||!created.data?.user)throw Error();
      const args={request_id:requestId,new_user_id:created.data.user.id,new_internal_email:email};
      let result;
      try{result=await admin.rpc('secondcareer_complete_counselor_registration',args)}catch{result=null}
      const valid=(r:any)=>!r?.error&&r?.data?.counselorId===args.new_user_id&&r?.data?.loginId===loginId;
      // Same idempotent transaction locks the request and confirms exactly the
      // same Auth user. This never repeats Auth creation or reveals old secrets.
      if(!valid(result))result=await admin.rpc('secondcareer_complete_counselor_registration',args);
      if(!valid(result))throw Error();
      return reply({counselorId:args.new_user_id,name,loginId,temporaryPassword:password},201);
    }catch{throw new APIError('COUNSELOR_OUTCOME_UNKNOWN',503)}
  }catch(error){return failure(error)}
}
Deno.serve(handleAdminCounselors);
