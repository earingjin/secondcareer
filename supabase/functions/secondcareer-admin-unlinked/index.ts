import {APIError, failure, headers, respond} from '../_shared/registration-http.ts';
import {authenticateAdmin, readAll} from '../_shared/admin-access.ts';

// Read only. A historical company_name never establishes a company link.
export async function handleAdminUnlinked(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'GET') return respond({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const {profile, admin, params} = await authenticateAdmin(req, ['name','companyName','page']);
    const name=(params.get('name')||'').trim().replace(/\s+/gu,' ');
    const companyName=(params.get('companyName')||'').trim().replace(/\s+/gu,' ');
    const pageText=params.get('page')||'1';
    if ([name,companyName].some(s=>s.length>100||/[\u0000-\u001f\u007f]/u.test(s))||!/^[1-9][0-9]{0,4}$/.test(pageText)) throw new APIError('INVALID_REQUEST',400);
    const page=Number(pageText), pageSize=20, org=profile.organization_id;
    let query=admin.from('participants').select('id,display_name,company_name,counselor_user_id',{count:'exact'}).eq('organization_id',org).is('company_id',null);
    const pattern=(s:string)=>'%'+s.replace(/[\\%_]/g,'\\$&')+'%';
    if(name)query=query.ilike('display_name',pattern(name));
    if(companyName)query=query.ilike('company_name',pattern(companyName));
    const {data,count,error}=await query.order('id',{ascending:true}).range((page-1)*pageSize,page*pageSize-1);
    if(error||!Array.isArray(data)||!Number.isSafeInteger(count)||count<0||data.length>pageSize)throw new APIError('QUERY_FAILED',503);
    const ids=[...new Set(data.map(p=>p.counselor_user_id).filter(Boolean))];
    const counselors=new Map<string,string>();
    if(ids.length){
      const rows=await readAll(()=>admin.from('user_profiles').select('user_id,display_name').eq('organization_id',org).eq('role','counselor').in('user_id',ids),'user_id');
      for(const row of rows)counselors.set(row.user_id,typeof row.display_name==='string'&&row.display_name.trim()?row.display_name.trim():'이름 미등록');
    }
    return respond({scope:'unlinked',generatedAt:new Date().toISOString(),total:count,page,pageSize,name,companyName,
      participants:data.map(p=>({id:p.id,name:p.display_name||'',companyName:p.company_name||'',
        counselorId:counselors.has(p.counselor_user_id)?p.counselor_user_id:null,
        counselorName:!p.counselor_user_id?'미배정':counselors.get(p.counselor_user_id)||'담당 확인 필요',status:'unlinked'}))});
  } catch(error) {return failure(error)}
}
Deno.serve(handleAdminUnlinked);
