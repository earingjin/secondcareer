import {APIError,failure,headers,readBody,secretDigest} from '../_shared/registration-http.ts';
import {authenticateAdmin,readAll} from '../_shared/admin-access.ts';
import {generateTemporaryPassword} from '../_shared/temporary-password.ts';
import {managerEnabled} from '../_shared/company-manager-access.ts';
const cors={...headers,'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function handleAdminCompanyManagers(req:Request){
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(!['GET','POST','PATCH'].includes(req.method))return reply({error:'METHOD_NOT_ALLOWED'},405);
  try{
    const {admin,profile,user,params}=await authenticateAdmin(req,['companyId','view']);managerEnabled();
    const id=params.get('companyId'),view=params.get('view');
    if(!uuid(id)||(view===null?params.size!==1:params.size!==2||view!=='available'||req.method!=='GET'))throw new APIError('INVALID_REQUEST');
    const companyId=id!.toLowerCase(),org=profile.organization_id;
    const company=await admin.from('client_companies').select('id').eq('organization_id',org).eq('id',companyId).maybeSingle();
    if(company.error)throw new APIError('MANAGER_QUERY_FAILED',503);if(!company.data)throw new APIError('FORBIDDEN',403);
    if(req.method==='GET'){
      // Default list is strictly scoped to the selected company. No account from
      // another company may be included unless an admin explicitly requests
      // the separate "available existing managers" view.
      const links=await readAll(()=>admin.from('company_manager_access').select('manager_user_id').eq('organization_id',org).eq('company_id',companyId),'manager_user_id');
      if(view==='available'){
        const accounts=await readAll(()=>admin.from('company_manager_accounts').select('user_id,email,status').eq('organization_id',org).eq('status','active'),'user_id');
        const linked=new Set(links.map(x=>x.manager_user_id));
        const availableManagers=[];
        for(const a of accounts){
          if(linked.has(a.user_id))continue;
          const {data:p,error}=await admin.from('user_profiles').select('display_name').eq('organization_id',org).eq('role','company_manager').eq('user_id',a.user_id).maybeSingle();
          if(error||!p)throw new APIError('MANAGER_QUERY_FAILED',503);
          availableManagers.push({id:a.user_id,name:p.display_name,email:a.email});
        }
        return reply({companyId,availableManagers});
      }
      const managers=[];
      for(const link of links){
        const {data:a,error:accountError}=await admin.from('company_manager_accounts').select('user_id,email,phone,status').eq('organization_id',org).eq('user_id',link.manager_user_id).maybeSingle();
        if(accountError||!a)throw new APIError('MANAGER_QUERY_FAILED',503);
        const {data:p,error:profileError}=await admin.from('user_profiles').select('display_name').eq('organization_id',org).eq('role','company_manager').eq('user_id',a.user_id).maybeSingle();
        if(profileError||!p)throw new APIError('MANAGER_QUERY_FAILED',503);
        managers.push({id:a.user_id,name:p.display_name,email:a.email,phone:a.phone,status:a.status,loginId:a.email,hasAccess:true});
      }
      return reply({companyId,managers});
    }
        const body=await readBody(req);
    if(req.method==='PATCH'){
      if(Object.keys(body).some(k=>!['action','managerId','status'].includes(k))||!uuid(body.managerId)||!['status','grant','revoke'].includes(body.action)||(body.action==='status'?!['active','suspended'].includes(body.status):Object.hasOwn(body,'status')))throw new APIError('INVALID_REQUEST');
      const managerId=body.managerId.toLowerCase();
      const account=await admin.from('company_manager_accounts').select('user_id').eq('organization_id',org).eq('user_id',managerId).maybeSingle();
      if(account.error)throw new APIError('MANAGER_QUERY_FAILED',503);if(!account.data)throw new APIError('FORBIDDEN',403);
      let q;
      if(body.action==='status')q=admin.from('company_manager_accounts').update({status:body.status}).eq('organization_id',org).eq('user_id',managerId).select('user_id').maybeSingle();
      else if(body.action==='grant')q=admin.from('company_manager_access').insert({organization_id:org,company_id:companyId,manager_user_id:managerId}).select('manager_user_id').maybeSingle();
      else q=admin.from('company_manager_access').delete().eq('organization_id',org).eq('company_id',companyId).eq('manager_user_id',managerId).select('manager_user_id').maybeSingle();
      const result=await q;
      if(result.error&&!(body.action==='grant'&&result.error.code==='23505'))throw new APIError('MANAGER_QUERY_FAILED',503);
      if(body.action==='status'&&!result.data)throw new APIError('MANAGER_OUTCOME_UNKNOWN',503);
      return reply({companyId,managerId,action:body.action,...(body.action==='status'?{status:body.status}:{hasAccess:body.action==='grant'})});
    }
    if(Object.keys(body).some(k=>!['name','email','phone','requestId'].includes(k))||!uuid(body.requestId)||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100||typeof body.email!=='string'||body.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())||typeof body.phone!=='string'||!/^[+0-9() .-]+$/.test(body.phone)||body.phone.replace(/\D/g,'').length<7||body.phone.replace(/\D/g,'').length>20)throw new APIError('INVALID_REQUEST');
    const loginId='cm_'+crypto.randomUUID().replace(/-/g,'').slice(0,16),name=body.name.trim(),email=body.email.trim().toLowerCase(),phone=body.phone.trim();
    const reserved=await admin.from('company_manager_registration_requests').insert({id:body.requestId.toLowerCase(),actor_user_id:user.id,organization_id:org,company_id:companyId,display_name:name,email,phone,login_id:loginId});
    if(reserved.error)throw new APIError(reserved.error.code==='23505'?'MANAGER_ALREADY_REQUESTED':'MANAGER_NOT_CONFIGURED',reserved.error.code==='23505'?409:503);
    const password=generateTemporaryPassword(),internalEmail='sp-'+await secretDigest(loginId)+'@accounts.example.invalid';
    const created=await admin.auth.admin.createUser({email:internalEmail,password,email_confirm:true,app_metadata:{must_change_password:true,temporary_password_digest:await secretDigest(password),registration_request_id:body.requestId.toLowerCase()}});
    if(created.error||!created.data?.user)throw new APIError('MANAGER_OUTCOME_UNKNOWN',503);
    const args={request_id:body.requestId.toLowerCase(),new_user_id:created.data.user.id,new_internal_email:internalEmail};
    let result=await admin.rpc('secondcareer_complete_manager_registration',args);
    if(result.error||result.data?.managerId!==created.data.user.id||result.data?.loginId!==loginId){
      result=await admin.rpc('secondcareer_recover_manager_registration',args);
      if(result.error||result.data?.outcome!=='complete'||result.data.managerId!==created.data.user.id||result.data.loginId!==loginId)throw new APIError('MANAGER_OUTCOME_UNKNOWN',503);
    }
    // Sole secret disclosure. No re-read/reissue, logging, Auth deletion or automatic retry.
    return reply({companyId,managerId:result.data.managerId,loginId:email,name,temporaryPassword:password},201);
  }catch(error){const r=failure(error);return new Response(r.body,{status:r.status,headers:cors})}
}
Deno.serve(handleAdminCompanyManagers);
