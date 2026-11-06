import {APIError, failure, headers, readBody} from '../_shared/registration-http.ts';
import {authenticateAdmin} from '../_shared/admin-access.ts';

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
    const {profile, admin, params} = await authenticateAdmin(req, ['id','search','status','page','pageSize']);
    const org = profile.organization_id, id = params.get('id');
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
    if (req.method === 'GET') return reply({company:previous});
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
