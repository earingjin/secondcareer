import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGIN_ID = /^[a-z0-9][a-z0-9_-]{5,31}$/;
const MAX_BODY_BYTES = 4096;

// Kept unused until account creation has a durable, concurrency-safe recovery
// protocol. The generated secret must never be written to the application DB.
function generateTemporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function readRequest(req: Request): Promise<Record<string, unknown>> {
  if (!req.body) throw new Error('INVALID_REQUEST');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error('INVALID_REQUEST');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('INVALID_REQUEST');
  }
  return value as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return respond({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return respond({ error: 'AUTH_REQUIRED' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return respond({ error: 'SERVER_CONFIG' }, 503);

  try {
    const auth = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await auth.auth.getUser(token);
    if (authError || !user) return respond({ error: 'AUTH_INVALID' }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: profile, error: profileError } = await admin
      .from('user_profiles')
      .select('role,organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) return respond({ error: 'PROFILE_QUERY_FAILED' }, 503);
    if (!profile || profile.role !== 'admin' || !profile.organization_id) {
      return respond({ error: 'FORBIDDEN' }, 403);
    }

    let body: Record<string, unknown>;
    try {
      body = await readRequest(req);
    } catch {
      return respond({ error: 'INVALID_REQUEST' }, 400);
    }
    // A supplied organizationId is deliberately ignored. It is never an
    // authorization source; the administrator profile defines the scope.
    const allowedFields = new Set(['displayName', 'loginId', 'counselorUserId', 'requestId', 'organizationId']);
    if (Object.keys(body).some(key => !allowedFields.has(key))) {
      return respond({ error: 'INVALID_REQUEST' }, 400);
    }
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const loginId = typeof body.loginId === 'string' ? body.loginId.trim().toLowerCase() : '';
    const counselorUserId = typeof body.counselorUserId === 'string' ? body.counselorUserId.trim() : '';
    if (!displayName || displayName.length > 12 || !LOGIN_ID.test(loginId) || !UUID.test(counselorUserId) ||
        (body.requestId !== undefined && (typeof body.requestId !== 'string' || !UUID.test(body.requestId)))) {
      return respond({ error: 'INVALID_REQUEST' }, 400);
    }

    const { data: counselor, error: counselorError } = await admin
      .from('user_profiles')
      .select('user_id')
      .eq('user_id', counselorUserId)
      .eq('organization_id', profile.organization_id)
      .eq('role', 'counselor')
      .maybeSingle();
    if (counselorError) return respond({ error: 'COUNSELOR_QUERY_FAILED' }, 503);
    if (!counselor) return respond({ error: 'FORBIDDEN' }, 403);

    const { data: existing, error: lookupError } = await admin
      .from('server_login_lookup')
      .select('user_id')
      .eq('login_id', loginId)
      .maybeSingle();
    if (lookupError) return respond({ error: 'LOOKUP_FAILED' }, 503);
    if (existing) return respond({ error: 'LOGIN_ID_UNAVAILABLE' }, 409);

    // Fail closed: a durable, concurrency-safe provisioning/recovery protocol
    // is not available. This read-only precheck is not a reservation and does
    // not provide idempotent creation. In particular, a lost Auth response
    // cannot safely be treated as either a successful or a failed creation.
    // generateTemporaryPassword must not run before this guard is replaced.
    // No Auth user, profile, login mapping, or participant is created here.
    return respond({ error: 'REGISTRATION_NOT_CONFIGURED' }, 503);
  } catch {
    // Do not return or log upstream errors: they may contain sensitive data.
    return respond({ error: 'SERVER_ERROR' }, 503);
  }
});
