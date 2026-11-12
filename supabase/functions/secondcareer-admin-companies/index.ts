import {APIError, failure, headers, readBody} from '../_shared/registration-http.ts';
import {authenticateAdmin, readAll} from '../_shared/admin-access.ts';

// REQ-A-001: separate client-company master. No participant/account/assessment writes.
const cors = {...headers, 'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS'};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers:cors});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = ['name','start_date','end_date','pm_name','pm_email','pm_phone'] as const;
const LIST = 'id,name,start_date,end_date,pm_name,status,created_at';
const DETAIL = LIST + ',pm_email,pm_phone,updated_at';
const text = (value: unknown, max: number) => {
  if (typeof value !== 'string') throw new APIError('INVALID_REQUEST');
  const s = value.trim().replace(/\s+/gu, ' ');
  if (!s || s.length > max || /[\u0000-\u001f\u007f]/u.test(s)) throw new APIError('INVALID_REQUEST');
  return s;
};
const validDate = (value: unknown) => typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) && value >= '0001-01-01' && value <= '9999-12-31' && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
function clean(source: Record<string, unknown>) {
  const name = text(source.name, 200), pm_name = text(source.pm_name, 100), pm_email = text(source.pm_email, 254), pm_phone = text(source.pm_phone, 30);
  if (!validDate(source.start_date) || !validDate(source.end_date) || (source.end_date as string) < (source.start_date as string) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pm_email) || !/^[+0-9() .-]+$/.test(pm_phone) || pm_phone.replace(/\D/g,'').length < 7 || pm_phone.replace(/\D/g,'').length > 20) throw new APIError('INVALID_REQUEST');
  return {name, start_date:source.start_date, end_date:source.end_date, pm_name, pm_email, pm_phone};
}
function dbError(error: any) {
  if (error) throw new APIError(error.code === '23505' ? 'COMPANY_NAME_UNAVAILABLE' : 'COMPANY_QUERY_FAILED', error.code === '23505' ? 409 : 503);
}
export async function handleAdminCompanies(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});
  if (!['GET','POST','PATCH'].includes(req.method)) return reply({error:'METHOD_NOT_ALLOWED'}, 405);
  try {
    const {profile, admin, params} = await authenticateAdmin(req, ['id','search','status','page','pageSize','section']);
    const org = profile.organization_id, id = params.get('id');
    if (params.has('section')) {
      if (params.get('section') !== 'counselors' || params.size !== 2 || !UUID.test(id || '') || !['GET','PATCH'].includes(req.method)) throw new APIError('INVALID_REQUEST');
      // A target ID never establishes scope. Inactive masters retain relationships;
      // this relation does not grant access to existing participants/reports.
      // Admin company-linked new registration validates this relation separately.
      const {data:company,error:companyError} = await admin.from('client_companies').select('id').eq('organization_id',org).eq('id',id?.toLowerCase()).maybeSingle();
      dbError(companyError); if (!company) throw new APIError('FORBIDDEN',403);
      if (req.method === 'GET') {
        const counselors = await readAll(()=>admin.from('user_profiles').select('user_id,display_name').eq('organization_id',org).eq('role','counselor'),'user_id');
        const assignments = await readAll(()=>admin.from('client_company_counselors').select('counselor_user_id,created_at').eq('organization_id',org).eq('company_id',company.id),'counselor_user_id');
        const allowed = new Set(counselors.map(c=>c.user_id));
        if (counselors.some(c=>typeof c.display_name !== 'string') || assignments.some(a=>!allowed.has(a.counselor_user_id)||typeof a.created_at !== 'string')) throw new APIError('ASSIGNMENT_QUERY_FAILED',503);
        return reply({companyId:company.id,counselors:counselors.map(c=>({id:c.user_id,name:c.display_name})),assignments:assignments.map(a=>({counselorUserId:a.counselor_user_id,createdAt:a.created_at}))});
      }
      const body = await readBody(req);
      if (Object.keys(body).some(k=>!['action','counselorUserId'].includes(k)) || !['assign','unassign'].includes(body.action) || typeof body.counselorUserId !== 'string' || !UUID.test(body.counselorUserId)) throw new APIError('INVALID_REQUEST');
      const counselorId = body.counselorUserId.toLowerCase();
      const {data:counselor,error:counselorError} = await admin.from('user_profiles').select('user_id').eq('organization_id',org).eq('role','counselor').eq('user_id',counselorId).maybeSingle();
      dbError(counselorError); if (!counselor) throw new APIError('FORBIDDEN',403);
      // Single relational writes. Composite FKs recheck org/role under concurrent changes.
      let query = body.action === 'assign'
        ? admin.from('client_company_counselors').insert({organization_id:org,company_id:company.id,counselor_user_id:counselorId})
        : admin.from('client_company_counselors').delete().eq('organization_id',org).eq('company_id',company.id).eq('counselor_user_id',counselorId);
      const {data,error} = await query.select('counselor_user_id').maybeSingle();
      if (error) throw new APIError(error.code === '23505' ? 'ASSIGNMENT_EXISTS' : error.code === '23503' ? 'ASSIGNMENT_CONFLICT' : 'ASSIGNMENT_QUERY_FAILED', ['23505','23503'].includes(error.code)?409:503);
      if (body.action === 'assign' && !data) throw new APIError('ASSIGNMENT_OUTCOME_UNKNOWN',503);
      return reply({companyId:company.id,counselorUserId:counselorId,assigned:body.action==='assign',changed:!!data},body.action==='assign'?201:200);
    }
    if (params.has('id') && (!UUID.test(id || '') || params.size !== 1)) throw new APIError('INVALID_REQUEST');
    if (req.method === 'GET' && !id) {
      const search = (params.get('search') || '').trim().replace(/\s+/gu, ' '), status = params.get('status') || 'all';
      const pageText = params.get('page') ?? '1', sizeText = params.get('pageSize') ?? '20';
      const page = Number(pageText), pageSize = Number(sizeText);
      if (search.length > 200 || /[\u0000-\u001f\u007f]/u.test(search) || !['all','active','inactive'].includes(status) || !/^[1-9][0-9]{0,4}$/.test(pageText) || !['10','20','50'].includes(sizeText)) throw new APIError('INVALID_REQUEST');
      let query = admin.from('client_companies').select(LIST, {count:'exact'}).eq('organization_id', org);
      if (status !== 'all') query = query.eq('status', status);
      if (search) query = query.ilike('name', '%' + search.replace(/[\\%_]/g, '\\$&') + '%');
      const {data, count, error} = await query.order('created_at', {ascending:false}).order('id', {ascending:false}).range((page - 1) * pageSize, page * pageSize - 1);
      dbError(error);
      if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0 || data.length > pageSize) throw new APIError('COMPANY_QUERY_FAILED', 503);
      return reply({companies:data, total:count, page, pageSize, search, status});
    }
    if (req.method === 'POST') {
      if (params.size) throw new APIError('INVALID_REQUEST');
      const body = await readBody(req);
      if (Object.keys(body).some(k => !FIELDS.includes(k as any))) throw new APIError('INVALID_REQUEST');
      const fields = clean(body);
      const {data, error} = await admin.from('client_companies').insert({...fields, organization_id:org}).select(DETAIL).single();
      dbError(error); if (!data) throw new APIError('COMPANY_QUERY_FAILED', 503);
      return reply({company:data}, 201);
    }
    if (!id) throw new APIError('INVALID_REQUEST');
    const {data:previous, error:readError} = await admin.from('client_companies').select(DETAIL).eq('organization_id', org).eq('id', id).maybeSingle();
    dbError(readError); if (!previous) throw new APIError('FORBIDDEN', 403);
    if (req.method === 'GET') {
      const linked = await admin.from('participants').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('company_id',id);
      const unlinked = await admin.from('participants').select('id',{count:'exact',head:true}).eq('organization_id',org).is('company_id',null);
      dbError(linked.error); dbError(unlinked.error);
      if (![linked.count,unlinked.count].every(n=>Number.isSafeInteger(n)&&n>=0)) throw new APIError('COMPANY_QUERY_FAILED',503);
      return reply({company:previous,linkage:{linkedParticipants:linked.count,unlinkedParticipants:unlinked.count}});
    }
    const body = await readBody(req), keys = Object.keys(body).filter(k => k !== 'expectedUpdatedAt');
    if (!keys.length || keys.some(k => ![...FIELDS,'status'].includes(k as any)) || typeof body.expectedUpdatedAt !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(body.expectedUpdatedAt) || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) throw new APIError('INVALID_REQUEST');
    if (body.status !== undefined && !['active','inactive'].includes(body.status)) throw new APIError('INVALID_REQUEST');
    const canonical = clean({...previous, ...body}), patch = Object.fromEntries(keys.map(k => [k, k === 'status' ? body.status : (canonical as any)[k]]));
    const {data, error} = await admin.from('client_companies').update(patch).eq('organization_id', org).eq('id', id).eq('updated_at', body.expectedUpdatedAt).select(DETAIL).maybeSingle();
    dbError(error); if (!data) throw new APIError('COMPANY_CONFLICT', 409);
    return reply({company:data});
  } catch (error) {
    const response = failure(error);
    return new Response(response.body, {status:response.status, headers:cors});
  }
}
Deno.serve(handleAdminCompanies);
