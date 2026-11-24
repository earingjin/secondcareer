import {authenticateAdmin} from '../_shared/admin-access.ts';
import {APIError, failure, headers, readBody, respond} from '../_shared/registration-http.ts';

const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const nullableId = (value: unknown) => value === null || uuid(value);

export async function handleParticipantAssignment(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'POST') return respond({error:'METHOD_NOT_ALLOWED'},405);
  try {
    const {user, profile, admin} = await authenticateAdmin(req);
    const body = await readBody(req);
    const {participantId, kind, targetId, expectedId, requestId} = body;
    if (Object.keys(body).length !== 5 || !['company','counselor'].includes(kind) ||
        !uuid(participantId) || !uuid(requestId) || !nullableId(targetId) || !nullableId(expectedId)) {
      throw new APIError('INVALID_REQUEST');
    }
    const {data, error} = await admin.rpc('secondcareer_assign_participant_v1', {
      p_actor:user.id, p_org:profile.organization_id, p_participant:participantId,
      p_kind:kind, p_target:targetId, p_expected:expectedId, p_request:requestId
    });
    if (error) {
      if (error.code === '42501') throw new APIError('FORBIDDEN',403);
      if (error.code === '22023') throw new APIError('TARGET_UNAVAILABLE',400);
      if (['40001','23505'].includes(error.code)) throw new APIError('CONFLICT',409);
      throw new APIError('ASSIGNMENT_UNCONFIRMED',503);
    }
    if (data?.requestId !== requestId.toLowerCase()) throw new APIError('ASSIGNMENT_UNCONFIRMED',503);
    return respond({requestId:data.requestId});
  } catch (error) { return failure(error); }
}

Deno.serve(handleParticipantAssignment);
