// A separate entitlement: never changes the four existing assistant features.
export async function examAccessForUser(admin, userId, now = Date.now()) {
  // Carômetro membership includes the correction tool. Check the active school
  // and subscription on every request so removing access stops new sessions.
  const {data:account,error:accountError}=await admin.from('platform_account_access').select('status').eq('user_id',userId).maybeSingle();
  if (!accountError && account?.status==='active') {
    const {data:members,error:memberError}=await admin.from('school_members').select('school_id').eq('user_id',userId).eq('status','active');
    if (!memberError && members?.length) {
      const ids=[...new Set(members.map(item=>item.school_id))];
      const [{data:schools,error:schoolError},{data:subscriptions,error:subscriptionError}]=await Promise.all([
        admin.from('schools').select('id').in('id',ids).eq('status','active'),
        admin.from('school_subscriptions').select('school_id,grant_expires_at').in('school_id',ids).eq('status','active')
      ]);
      if (!schoolError && !subscriptionError && subscriptions?.some(item=>schools?.some(school=>school.id===item.school_id) && (!item.grant_expires_at || Date.parse(item.grant_expires_at)>now))) {
        return {active:true,expiresAt:null,status:'carometro'};
      }
    }
  }
  if (admin.rpc) {
    const paid=await admin.rpc('siap_exam_commerce_access',{p_user:userId});
    if (!paid.error && paid.data) return paid.data;
  }
  const {data, error} = await admin.from('siap_exam_access_grants').select('expires_at,revoked_at').eq('user_id',userId).maybeSingle();
  if (error) return {active:false,expiresAt:null,status:'unavailable'};
  if (!data) return {active:false,expiresAt:null,status:'not_granted'};
  const expires = data.expires_at === null ? Infinity : Date.parse(data.expires_at);
  const active = !data.revoked_at && expires > now;
  return {active,expiresAt:data.expires_at,status:data.revoked_at?'revoked':active?'granted':'expired'};
}
