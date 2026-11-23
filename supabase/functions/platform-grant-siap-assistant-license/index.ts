import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean)
const cors = (request:Request):Record<string,string> => {
  const origin = request.headers.get('Origin') ?? ''
  return allowedOrigins().includes(origin) ? {
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Vary':'Origin',
  } : {}
}
const json = (request:Request, body:Record<string,unknown>, status=200) =>
  new Response(JSON.stringify(body), { status, headers:{...cors(request),'Content-Type':'application/json'} })

Deno.serve(async request => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request,{ok:false,code:'forbidden_origin'},403)
  if (request.method === 'OPTIONS') return new Response('ok',{headers:cors(request)})
  if (request.method !== 'POST') return json(request,{ok:false,code:'method_not_allowed'},405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !anonKey || !serviceKey) return json(request,{ok:false,code:'server_not_configured'},503)

  const authorization = request.headers.get('Authorization') ?? ''
  const caller = createClient(url,anonKey,{global:{headers:{Authorization:authorization}}})
  const {data:{user:owner},error:authError} = await caller.auth.getUser()
  if (authError || !owner) return json(request,{ok:false,code:'login_required'},401)
  const {data:isOwner,error:ownerError} = await caller.rpc('is_platform_owner')
  if (ownerError || isOwner !== true) return json(request,{ok:false,code:'owner_required'},403)

  let email = '', expiresAt:string|null = null, grantType = 'license'
  try {
    const body = await request.json()
    email = String(body?.email ?? '').trim().toLowerCase()
    expiresAt = body?.expiresAt == null || body.expiresAt === '' ? null : String(body.expiresAt)
    grantType = String(body?.grantType ?? 'license')
  } catch { return json(request,{ok:false,code:'invalid_request'},400) }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(request,{ok:false,code:'invalid_email'},400)
  if (!['license','free_trial'].includes(grantType)) return json(request,{ok:false,code:'invalid_grant_type'},400)
  if (grantType === 'free_trial' && expiresAt) return json(request,{ok:false,code:'invalid_request'},400)
  if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) {
    return json(request,{ok:false,code:'invalid_expiry'},400)
  }

  const admin = createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}})
  let userId:string|null = null
  for (let page=1;page<=50&&!userId;page+=1) {
    const {data,error} = await admin.auth.admin.listUsers({page,perPage:200})
    if (error) return json(request,{ok:false,code:'account_lookup_failed'},502)
    userId = data.users.find(item => item.email?.trim().toLowerCase() === email)?.id ?? null
    if (data.users.length < 200) break
  }

  let createdAccount = false
  if (!userId) {
    const {data,error} = await admin.auth.admin.createUser({email,email_confirm:false})
    if (error || !data.user) return json(request,{ok:false,code:'account_create_failed'},502)
    userId = data.user.id
    createdAccount = true
  }

  const {error:grantError} = grantType === 'free_trial'
    ? await caller.rpc('platform_grant_siap_assistant_free_trial',{p_user_id:userId})
    : await caller.rpc('platform_set_siap_assistant_access',{
      p_user_id:userId,p_enabled:true,p_expires_at:expiresAt,
    })
  if (grantError) {
    if (createdAccount) await admin.auth.admin.deleteUser(userId)
    const message = grantError.message ?? ''
    const code = message.includes('manual_trial_already_granted') ? 'trial_already_granted'
      : message.includes('active_access_exists') ? 'active_access_exists'
      : grantType === 'free_trial' ? 'trial_grant_failed' : 'license_grant_failed'
    return json(request,{ok:false,code},code === 'trial_already_granted' || code === 'active_access_exists' ? 409 : 403)
  }

  const emailClient = createClient(url,anonKey,{auth:{autoRefreshToken:false,persistSession:false}})
  const redirectTo = `${origin}/assistente-siap-conta.html?plano=${grantType === 'free_trial' ? 'trial' : 'account'}`
  const {error:emailError} = await emailClient.auth.signInWithOtp({
    email,options:{emailRedirectTo:redirectTo,shouldCreateUser:false},
  })
  return json(request,{
    ok:true,email,expiresAt,grantType,createdAccount,notificationSent:!emailError,
  })
})
