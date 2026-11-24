import {authenticateAdmin} from '../_shared/admin-access.ts';
import {failure, headers, respond} from '../_shared/registration-http.ts';

export async function handleRegistration(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'POST') return respond({error:'METHOD_NOT_ALLOWED'},405);
  try {
    await authenticateAdmin(req);
    return respond({error:'PARTICIPANT_REGISTRATION_RETIRED'},410);
  } catch (error) { return failure(error); }
}
Deno.serve(handleRegistration);
