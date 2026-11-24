import {authenticateAdmin, readAll} from '../_shared/admin-access.ts';
import {APIError, failure, headers, respond} from '../_shared/registration-http.ts';

const methods = 'GET, OPTIONS';
const linkIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

function publicBaseUrl(value: unknown) {
  // The stored address supplies the path. Only server configuration can approve its origin.
  const allowed = /^https:\/\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?(:[0-9]{1,5})?(\/([a-z0-9._~!$&'()*+,;=:@/-]|%[a-f0-9]{2})*)?$/i;
  if (typeof value !== 'string' || value.length > 2048 || !allowed.test(value)) return null;
  try {
    const url = new URL(value);
    if (/(^|[.-])(localhost|local)([.-]|$)/.test(url.hostname)) return null;
    const origins = Deno.env.get('SECONDCAREER_PUBLIC_INTAKE_ALLOWED_ORIGINS')?.split(',') ?? [];
    return origins.some(entry => {
      const origin = entry.trim();
      return origin === url.origin || origin === url.origin + '/';
    }) ? url.href : null;
  } catch {
    return null;
  }
}

export async function handleAdminPublicIntakeLinks(req: Request) {
  if (req.method === 'OPTIONS') {
    const status = new URL(req.url).searchParams.size ? 400 : 204;
    return new Response(null, {status, headers:{...headers,'Access-Control-Allow-Methods':methods}});
  }
  let response: Response;
  try {
    if (req.method !== 'GET') throw new APIError('METHOD_NOT_ALLOWED', 405);
    const {profile, admin} = await authenticateAdmin(req);
    const organizationId = profile.organization_id;
    const {data:organization, error} = await admin.from('organizations').select('assessment_url')
      .eq('id', organizationId).maybeSingle();
    if (error || !organization) throw new APIError('QUERY_FAILED', 503);
    const rows = await readAll(() => admin.from('public_intake_links').select('id,enabled,expires_at,created_at')
      .eq('organization_id', organizationId), 'id');
    const links = rows.map(({id,enabled,expires_at,created_at}) => {
      if (!linkIdPattern.test(id) || typeof enabled !== 'boolean' ||
          (expires_at !== null && !validDate(expires_at)) || !validDate(created_at)) {
        throw new APIError('QUERY_FAILED', 503);
      }
      return {id,enabled,expiresAt:expires_at === null ? null : new Date(expires_at).toISOString(),createdAt:new Date(created_at).toISOString()};
    });
    response = respond({
      baseUrl:publicBaseUrl(organization.assessment_url),
      serverTime:new Date().toISOString(),
      intakeEnabled:Deno.env.get('SECONDCAREER_PUBLIC_INTAKE_ENABLED') === 'true',
      links
    });
  } catch (error) {
    response = failure(error);
  }
  response.headers.set('Access-Control-Allow-Methods', methods);
  if (response.status === 405) response.headers.set('Allow', methods);
  return response;
}

Deno.serve(handleAdminPublicIntakeLinks);
