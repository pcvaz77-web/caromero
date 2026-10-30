import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cpfDigits = (value: unknown) => String(value || '').replace(/\D/g, '');
const nameKey = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
const validCpf = (cpf: string) => {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    if (Number(cpf[length]) !== ((sum * 10) % 11) % 10) return false;
  }
  return true;
};
const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
const cpfEmail = async (cpf: string, secret: string) => {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    { name:'HMAC',hash:'SHA-256' },false,['sign']);
  const bytes = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(cpf));
  const tag = [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,40);
  return `familia-cpf-${tag}@sistemacarometro.com.br`;
};
const publicError = 'Seu cadastro ainda não foi realizado pela escola. Procure a secretaria.';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error:'Método inválido.' }, 405);
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply({ error:'Solicitação inválida.' }, 400);
    const input = JSON.parse(raw) as Record<string, unknown>;
    const action = input.action;
    const cpf = cpfDigits(input.cpf);
    if (!['preview','activate','login'].includes(String(action)) || !validCpf(cpf))
      return reply({ error:'Confira o CPF informado.' }, 400);
    if (action !== 'login' && (typeof input.schoolId !== 'string' || !uuid.test(input.schoolId)
      || typeof input.name !== 'string' || nameKey(input.name).length < 2))
      return reply({ error:'Confira seu nome completo e CPF.' }, 400);
    if (action === 'activate' && (typeof input.password !== 'string' || input.password.length !== 8))
      return reply({ error:'Crie uma senha de 8 caracteres.' }, 400);
    if (action === 'login' && (typeof input.password !== 'string' || !input.password))
      return reply({ error:'Confira o CPF e a senha.' }, 400);

    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authSecret = Deno.env.get('FAMILY_CPF_AUTH_SECRET');
    if (!url || !serviceKey || !anonKey || !authSecret || authSecret.length<32)
      return reply({ error:'Serviço indisponível.' }, 503);
    const admin = createClient(url, serviceKey, { auth:{ persistSession:false, autoRefreshToken:false } });
    const auth = createClient(url, anonKey, { auth:{ persistSession:false, autoRefreshToken:false } });
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    for (const key of [`ip:${ip}`,`cpf:${cpf}`]) {
      const fingerprint = await digest(key);
      const { data: allowed, error } = await admin.rpc('family_cpf_limit', { p_fingerprint:fingerprint });
      if (error || allowed !== true) return reply({ error:'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }, 429);
    }
    const { data: profiles, error: profileError } = await admin.from('family_cpf_guardians')
      .select('id,school_id,guardian_name,guardian_user_id,removed_at')
      .eq('cpf',cpf);
    if (profileError) return reply({ error:'Serviço indisponível.' }, 503);

    let invite: { token:string;guardian_id:string;school_id:string;expires_at:string;claimed_at:string | null } | null = null;
    if (input.token !== undefined) {
      if (typeof input.token !== 'string' || !uuid.test(input.token)
        || typeof input.schoolId !== 'string' || !uuid.test(input.schoolId))
        return reply({ error:'Convite individual inválido ou vencido.' }, 404);
      const { data, error }=await admin.from('family_cpf_invites')
        .select('token,guardian_id,school_id,expires_at,claimed_at')
        .eq('token',input.token).maybeSingle();
      if (error || !data || data.claimed_at || new Date(data.expires_at).getTime()<=Date.now()
        || data.school_id!==input.schoolId)
        return reply({ error:'Convite individual inválido ou vencido.' }, 404);
      invite=data;
    }

    if (action === 'login') {
      const accounts = (profiles || []).filter(row => row.guardian_user_id);
      if (!accounts.length || accounts.some(row => row.guardian_user_id !== accounts[0].guardian_user_id))
        return reply({ error:'CPF ou senha incorretos.' }, 400);
      const { data: account, error: accountError }=await admin.auth.admin.getUserById(accounts[0].guardian_user_id);
      if (accountError || !account?.user?.email) return reply({ error:'CPF ou senha incorretos.' }, 400);
      const { data: signed, error: signError } = await auth.auth.signInWithPassword({
        email:account.user.email, password:input.password as string,
      });
      if (signError || !signed?.session || signed.user.id !== accounts[0].guardian_user_id
        || signed.user.app_metadata?.family_portal !== true)
        return reply({ error:'CPF ou senha incorretos.' }, 400);
      if (invite) {
        const invitedProfile=(profiles || []).find(row => row.id===invite.guardian_id
          && !row.removed_at && row.guardian_user_id===signed.user.id);
        if (!invitedProfile) return reply({ error:'Convite individual inválido ou vencido.' }, 404);
        const { error: redeemError }=await admin.rpc('family_cpf_redeem_invite', {
          p_token:invite.token,p_guardian_id:invite.guardian_id,p_user_id:signed.user.id,
        });
        if (redeemError) return reply({ error:'Convite individual inválido ou vencido.' }, 404);
      }
      for (const profile of profiles || []) {
        if (profile.removed_at) continue;
        if (profile.guardian_user_id && profile.guardian_user_id !== signed.user.id) continue;
        if (nameKey(profile.guardian_name) !== nameKey(accounts[0].guardian_name)) continue;
        const { error: claimError } = await admin.rpc('family_cpf_claim', {
          p_guardian_id:profile.id, p_user_id:signed.user.id,
        });
        if (claimError) console.error('Falha ao atualizar vínculos por CPF:', claimError.code || 'erro');
      }
      return reply({ access_token:signed.session.access_token, refresh_token:signed.session.refresh_token });
    }

    const profile = (profiles || []).find(row => !row.removed_at && row.school_id === input.schoolId
      && nameKey(row.guardian_name) === nameKey(input.name));
    const { data: school } = await admin.from('schools').select('id')
      .eq('id',input.schoolId as string).eq('status','active').maybeSingle();
    if (!profile || !school || (invite && invite.guardian_id!==profile.id))
      return reply({ error:invite?'Convite individual inválido ou vencido.':publicError }, 404);
    const { data: childRows, error: childError } = await admin.from('family_cpf_children')
      .select('student_id').eq('guardian_id',profile.id).eq('school_id',profile.school_id).eq('status','active');
    if (childError || !childRows?.length) return reply({ error:publicError }, 404);
    const { data: students, error: studentError } = await admin.from('students')
      .select('id,full_name,class_name,class_id').eq('school_id',profile.school_id).eq('enrollment_status','active')
      .in('id',childRows.map(row => row.student_id));
    if (studentError || !students?.length) return reply({ error:publicError }, 404);
    if (action === 'preview') {
      if (profile.guardian_user_id) return reply({ existing:true });
      return reply({ students:students.map(row => ({ name:row.full_name, class_name:row.class_name })) });
    }
    if (profile.guardian_user_id) return reply({ existing:true }, 409);
    const registeredAccounts = (profiles || []).filter(row => row.guardian_user_id);
    if (registeredAccounts.length)
      return reply({ existing:true }, 409);

    const password = input.password as string;
    let createdUserId: string | null = null;
    const email = await cpfEmail(cpf,authSecret);
    let signed = await auth.auth.signInWithPassword({ email,password });
    if (signed.error || !signed.data?.session) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password, email_confirm:true, app_metadata:{ family_portal:true, family_cpf:true },
      });
      if (createError || !created?.user) return reply({ error:'Este CPF já tem acesso. Entre com sua senha.' }, 409);
      createdUserId = created.user.id;
      signed = await auth.auth.signInWithPassword({ email,password });
    }
    if (!signed.data?.session || !signed.data.user || signed.data.user.app_metadata?.family_portal !== true) {
      return reply({ error:'Não foi possível criar o acesso.' }, 500);
    }
    const { error: claimError } = invite
      ? await admin.rpc('family_cpf_redeem_invite', {
        p_token:invite.token,p_guardian_id:profile.id,p_user_id:signed.data.user.id,
      })
      : await admin.rpc('family_cpf_claim', {
        p_guardian_id:profile.id,p_user_id:signed.data.user.id,
      });
    if (claimError) {
      return reply({ error:'Não foi possível concluir o cadastro. Consulte a escola.' }, 409);
    }
    return reply({ access_token:signed.data.session.access_token,
      refresh_token:signed.data.session.refresh_token, created:!!createdUserId });
  } catch {
    return reply({ error:'Não foi possível continuar. Confira os dados e tente novamente.' }, 400);
  }
});
