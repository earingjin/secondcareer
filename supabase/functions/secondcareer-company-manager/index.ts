import {APIError, failure, headers, readBody, respond, secretDigest} from '../_shared/registration-http.ts';
import {managerAccess, managerContext} from '../_shared/company-manager-access.ts';
export async function handleCompanyManager(req: Request) {
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','POST'].includes(req.method))return respond({error:'METHOD_NOT_ALLOWED'},405);
  try {
    const context=await managerAccess(req),{admin,user}=context,params=new URL(req.url).searchParams;
    if([...params.keys()].some(k=>k!=='companyId')||params.size>1)throw new APIError('INVALID_REQUEST');
    const companyId=params.get('companyId');
    if(companyId!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId))throw new APIError('INVALID_REQUEST');
    const view=await managerContext(context,companyId?.toLowerCase()??null);
    if(req.method==='GET')return respond(view);
    if(params.size)throw new APIError('INVALID_REQUEST');
    const body=await readBody(req);
    if(Object.keys(body).some(k=>!['action','password'].includes(k))||body.action!=='change-password')throw new APIError('FORBIDDEN',403);
    if(!view.mustChangePassword)throw new APIError('FORBIDDEN',403);
    if(typeof body.password!=='string'||body.password.length<12||body.password.length>128||user.app_metadata?.temporary_password_digest===await secretDigest(body.password))throw new APIError('INVALID_PASSWORD');
    const {error}=await admin.auth.admin.updateUserById(user.id,{password:body.password,app_metadata:{...user.app_metadata,temporary_password_digest:null,must_change_password:false}});
    if(error)throw new APIError('PASSWORD_UPDATE_FAILED',503);
    const result=await admin.rpc('secondcareer_manager_password_changed',{manager_user_id:user.id});
    if(result.error||result.data!==true)throw new APIError('PASSWORD_UPDATE_FAILED',503);
    return respond({changed:true});
  }catch(error){return failure(error)}
}
Deno.serve(handleCompanyManager);
