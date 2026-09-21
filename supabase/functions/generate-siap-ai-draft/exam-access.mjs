// A separate entitlement: never changes the four existing assistant features.
export async function examAccessForUser(admin, userId, now = Date.now()) {
  const {data, error} = await admin.from('siap_exam_access_grants').select('expires_at,revoked_at').eq('user_id',userId).maybeSingle();
  if (error) return {active:false,expiresAt:null,status:'unavailable'};
  if (!data) return {active:false,expiresAt:null,status:'not_granted'};
  const expires = data.expires_at === null ? Infinity : Date.parse(data.expires_at);
  const active = !data.revoked_at && expires > now;
  return {active,expiresAt:data.expires_at,status:data.revoked_at?'revoked':active?'granted':'expired'};
}
