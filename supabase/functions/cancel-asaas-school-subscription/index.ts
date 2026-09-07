import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean)
const cors = (request: Request): Record<string, string> => {
  const origin = request.headers.get('Origin') ?? ''
  return allowedOrigins().includes(origin) ? {
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Vary':'Origin'
  } : {}
}
const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers:{ ...cors(request), 'Content-Type':'application/json' } })

Deno.serve(async request => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request, { error:'Origem não autorizada.' }, 403)
  if (request.method === 'OPTIONS') return new Response('ok', { headers:cors(request) })
  if (request.method !== 'POST') return json(request, { error:'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const asaasKey = Deno.env.get('ASAAS_API_KEY')
  if (!asaasKey) return json(request, { error:'Asaas não configurado.' }, 503)

  const authorization = request.headers.get('Authorization') ?? ''
  const caller = createClient(url, anonKey, { global:{ headers:{ Authorization:authorization } } })
  const { data:{ user } } = await caller.auth.getUser()
  if (!user) return json(request, { error:'Sessão inválida.' }, 401)
  const { data:isOwner } = await caller.rpc('is_platform_owner')
  if (isOwner !== true) return json(request, { error:'Acesso negado.' }, 403)

  let applicationId: unknown
  try { ({ applicationId } = await request.json()) } catch { return json(request, { error:'Solicitação inválida.' }, 400) }
  if (typeof applicationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(applicationId)) {
    return json(request, { error:'Solicitação inválida.' }, 400)
  }

  const admin = createClient(url, serviceKey, { auth:{ autoRefreshToken:false, persistSession:false } })
  const { data:payment, error:paymentError } = await admin.from('platform_payment_subscriptions')
    .select('id,provider_subscription_id,status,school_id').eq('application_id', applicationId).eq('provider', 'asaas').maybeSingle()
  if (paymentError) return json(request, { error:'Não foi possível consultar o pagamento.' }, 500)
  if (!payment) return json(request, { error:'Assinatura não encontrada.' }, 404)
  if (payment.school_id) return json(request, { error:'Esta assinatura já possui uma escola vinculada.' }, 409)

  if (payment.provider_subscription_id && payment.status !== 'cancelled') {
    const response = await fetch(`${Deno.env.get('ASAAS_API_URL') ?? 'https://api-sandbox.asaas.com/v3'}/subscriptions/${encodeURIComponent(payment.provider_subscription_id)}`, {
      method:'DELETE',
      headers:{ access_token:asaasKey, 'User-Agent':'Carometro/1.0' }
    })
    if (!response.ok && response.status !== 404) return json(request, { error:'O Asaas não confirmou o cancelamento.' }, 502)
  }

  const { error:paymentUpdateError } = await admin.from('platform_payment_subscriptions')
    .update({ status:'cancelled', provider_status:'DELETED', updated_at:new Date().toISOString() }).eq('id', payment.id)
  if (paymentUpdateError) return json(request, { error:'O pagamento foi cancelado, mas não foi possível atualizar o registro local.' }, 500)

  const { error:cancelError } = await caller.rpc('platform_cancel_school_application', { p_application_id:applicationId })
  if (cancelError) return json(request, { error:cancelError.message }, 400)
  return json(request, { cancelled:true, emailReleased:true })
})
