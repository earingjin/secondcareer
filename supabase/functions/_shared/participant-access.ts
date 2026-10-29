// Call immediately after verified getUser(), BEFORE all assessment reads,
// reports and writes. Use the fresh Auth user, never JWT/user_metadata.
export function participantAccessError(user: {app_metadata?: Record<string, unknown>}) {
  const metadata=user.app_metadata;
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return 'ACCOUNT_STATE_INVALID';
  const flag=metadata.must_change_password;
  if(flag===true||(flag===undefined&&Object.hasOwn(metadata,'registration_request_id')))return 'PASSWORD_CHANGE_REQUIRED';
  // Legacy accounts have no registration marker or flag. New accounts must
  // carry an explicit false after the server completes their password change.
  return flag===undefined||flag===false?null:'ACCOUNT_STATE_INVALID';
}
