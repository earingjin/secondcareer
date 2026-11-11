import {authenticate, APIError} from './registration-http.ts';
import {readAll} from './admin-access.ts';
export const managerEnabled = () => { if (Deno.env.get('SECONDCAREER_COMPANY_MANAGER_ENABLED') !== 'true') throw new APIError('MANAGER_NOT_CONFIGURED',503); };
export async function managerAccess(req: Request) {
  const context = await authenticate(req,['company_manager']);
  await managerAccount(context);
  return context;
}
export async function managerAccount({admin,profile}: any) {
  managerEnabled();
  const {data,error} = await admin.from('company_manager_accounts').select('user_id,status,must_change_password').eq('organization_id',profile.organization_id).eq('user_id',profile.user_id).maybeSingle();
  if (error) throw new APIError('MANAGER_QUERY_FAILED',503);
  if (!data || data.status !== 'active' || typeof data.must_change_password !== 'boolean') throw new APIError('FORBIDDEN',403);
  return data;
}
export async function managerContext(context: any, companyId: string | null = null) {
  const {admin,profile} = context, account = await managerAccount(context);
  const links = await readAll(()=>admin.from('company_manager_access').select('company_id').eq('organization_id',profile.organization_id).eq('manager_user_id',profile.user_id),'company_id');
  if (!links.length || companyId && !links.some(c=>c.company_id===companyId)) throw new APIError('FORBIDDEN',403);
  if (account.must_change_password) return {profile:{role:'company_manager'},mustChangePassword:true,companies:[]};
  const companies=[];
  for (const link of links) {
    if (companyId && link.company_id!==companyId) continue;
    const {data,error}=await admin.from('client_companies').select('id,name').eq('organization_id',profile.organization_id).eq('id',link.company_id).maybeSingle();
    if(error || !data)throw new APIError('MANAGER_QUERY_FAILED',503);
    companies.push(data);
  }
  return {profile:{role:'company_manager'},mustChangePassword:false,companies};
}
