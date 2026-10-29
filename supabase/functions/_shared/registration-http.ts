import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

export const headers = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store','Pragma':'no-cache'};
export const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers});
export async function secretDigest(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
}
export class APIError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export async function readBody(req: Request) {
  if (!req.body) throw new APIError('INVALID_REQUEST');
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); throw new APIError('INVALID_REQUEST'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new APIError('INVALID_REQUEST'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new APIError('INVALID_REQUEST');
  return body;
}
export async function authenticate(req: Request) {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new APIError('AUTH_REQUIRED', 401);
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_ANON_KEY'), secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || !secret) throw new APIError('SERVER_CONFIG', 503);
  const options = {auth:{persistSession:false, autoRefreshToken:false}};
  const auth = createClient(url, key, options), admin = createClient(url, secret, options);
  const {data:{user}, error} = await auth.auth.getUser(token);
  if (error || !user) throw new APIError('AUTH_INVALID', 401);
  const {data:profile, error:profileError} = await admin.from('user_profiles').select('user_id,role,organization_id,display_name').eq('user_id', user.id).maybeSingle();
  if (profileError) throw new APIError('PROFILE_QUERY_FAILED', 503);
  if (!profile || !profile.organization_id || !['admin','counselor','participant'].includes(profile.role)) throw new APIError('FORBIDDEN', 403);
  return {user, profile, admin};
}
export function failure(error: unknown) {
  return error instanceof APIError ? respond({error:error.code}, error.status) : respond({error:'SERVER_ERROR'}, 503);
}
