export async function consumeDeviceFreeUse(admin,userId,feature,accessStatusForUser) {
  for (let attempt=0; attempt<4; attempt++) {
    const access=await accessStatusForUser(admin,userId);
    if (access.active !== true) return {allowed:false,unlimited:false,remaining:0,access};
    if (access.mode === 'carometro' || access.mode === 'subscription') return {allowed:true,unlimited:true,remaining:null,access};
    if (access.mode !== 'external' || access.status !== 'free' || Number(access.freeUses?.[feature] ?? 0) <= 0)
      return {allowed:false,unlimited:false,remaining:0,access};
    const {data:row,error:readError}=await admin.from('siap_assistant_free_usage').select('used_count').eq('user_id',userId).eq('feature_key',feature).maybeSingle();
    if (readError) throw readError;
    if (!row) {
      const {data:inserted,error}=await admin.from('siap_assistant_free_usage').insert({user_id:userId,feature_key:feature,used_count:1}).select('used_count').maybeSingle();
      if (error?.code === '23505') continue;
      if (error || !inserted) throw error || new Error('usage_insert_failed');
    } else {
      const count=Number(row.used_count);
      if (count >= 2) return {allowed:false,unlimited:false,remaining:0,access};
      const {data:updated,error}=await admin.from('siap_assistant_free_usage').update({used_count:count+1,updated_at:new Date().toISOString()})
        .eq('user_id',userId).eq('feature_key',feature).eq('used_count',count).lt('used_count',2).select('used_count').maybeSingle();
      if (error) throw error;
      if (!updated) continue;
    }
    const current=await accessStatusForUser(admin,userId);
    return {allowed:true,unlimited:false,remaining:current.freeUses?.[feature] ?? 0,access:current};
  }
  throw new Error('usage_conflict');
}
