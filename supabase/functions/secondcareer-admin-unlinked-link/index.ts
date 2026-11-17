import {APIError, failure, headers, readBody, respond} from '../_shared/registration-http.ts';
import {authenticateAdmin} from '../_shared/admin-access.ts';

const uuid = (v: unknown): v is string => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const errors: Record<string,[string,number]> = {
  FORBIDDEN:['FORBIDDEN',403], REQUEST_CONFLICT:['REQUEST_CONFLICT',409], COMPANY_CONFLICT:['COMPANY_CONFLICT',409],
  COMPANY_INACTIVE:['COMPANY_INACTIVE',409], COUNSELOR_REVIEW_REQUIRED:['COUNSELOR_REVIEW_REQUIRED',409]
};

export async function handleAdminUnlinkedLink(req: Request) {
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return respond({error:'METHOD_NOT_ALLOWED'},405);
  try{
    const {user,profile,admin}=await authenticateAdmin(req);
    const body=await readBody(req),keys=Object.keys(body);
    if(keys.length!==3||keys.some(k=>!['participantId','companyId','requestId'].includes(k))||!uuid(body.participantId)||!uuid(body.companyId)||!uuid(body.requestId))throw new APIError('INVALID_REQUEST',400);
    const participantId=body.participantId.toLowerCase(),companyId=body.companyId.toLowerCase(),requestId=body.requestId.toLowerCase();
    const {data,error}=await admin.rpc('secondcareer_link_unlinked_participant',{
      actor_id:user.id,actor_org:profile.organization_id,target_participant_id:participantId,target_company_id:companyId,operation_id:requestId
    });
    if(error){const mapped=errors[error.message];if(mapped)throw new APIError(mapped[0],mapped[1]);throw new APIError('LINK_OUTCOME_UNKNOWN',503)}
    if(!data||!['linked','already_completed'].includes(data.outcome)||data.participantId!==participantId||data.companyId!==companyId||data.requestId!==requestId||typeof data.linkedAt!=='string')throw new APIError('LINK_OUTCOME_UNKNOWN',503);
    const {data:company,error:companyError}=await admin.from('client_companies').select('name').eq('organization_id',profile.organization_id).eq('id',companyId).maybeSingle();
    if(companyError||!company||typeof company.name!=='string')throw new APIError('LINK_OUTCOME_UNKNOWN',503);
    return respond({outcome:data.outcome,participantId,companyId,companyName:company.name,linkedAt:data.linkedAt,requestId});
  }catch(error){return failure(error)}
}
Deno.serve(handleAdminUnlinkedLink);
