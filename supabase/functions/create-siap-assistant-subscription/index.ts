import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean)
const cors = (request: Request): Record<string, string> => {
  const origin = request.headers.get('Origin') ?? ''
  return allowedOrigins().includes(origin) ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin',
  } : {}
}
const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(request), 'Content-Type': 'application/json' } })

Deno.serve(async request => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request, { ok:false, code:'forbidden_origin' }, 403)
  if (request.method === 'OPTIONS') return new Response('ok', { headers:cors(request) })
  if (request.method !== 'POST') return json(request, { ok:false, code:'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const mercadoPagoToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? ''
  if (!url || !anonKey || !serviceKey || !mercadoPagoToken) return json(request, { ok:false, code:'server_not_configured' }, 503)

  const authorization = request.headers.get('Authorization') ?? ''
  const caller = createClient(url, anonKey, { global:{ headers:{ Authorization:authorization } } })
  const { data:{ user } } = await caller.auth.getUser()
  if (!user?.email) return json(request, { ok:false, code:'login_required' }, 401)

  let planKey = ''
  let legalAccepted = false
  try {
    const body = await request.json()
    planKey = String(body?.planKey ?? '')
    legalAccepted = body?.legalAccepted === true
  } catch { /* validado abaixo */ }
  if (!['monthly', 'semiannual'].includes(planKey)) return json(request, { ok:false, code:'invalid_plan' }, 400)
  if (!legalAccepted) return json(request, { ok:false, code:'legal_acceptance_required' }, 400)

  const admin = createClient(url, serviceKey, { auth:{ autoRefreshToken:false, persistSession:false } })
  const { data:plan, error:planError } = await admin.from('siap_assistant_plans')
    .select('plan_key,display_name,amount,billing_months,active').eq('plan_key', planKey).maybeSingle()
  if (planError || !plan?.active || !plan.amount || Number(plan.amount) <= 0) {
    return json(request, { ok:false, code:'plan_not_available' }, 409)
  }

  const { data:existing } = await admin.from('siap_assistant_payment_subscriptions')
    .select('id,status,checkout_url,external_reference').eq('user_id', user.id).in('status', ['creating','pending','authorized','paused'])
    .order('created_at', { ascending:false }).limit(1).maybeSingle()
  if (existing?.status === 'authorized' || existing?.status === 'paused') {
    return json(request, { ok:false, code:'subscription_already_exists' }, 409)
  }
  if (existing?.checkout_url) return json(request, { ok:true, checkoutUrl:existing.checkout_url, reused:true })

  let payment: { id:string; external_reference:string } | null = existing
    ? { id:String(existing.id), external_reference:String(existing.external_reference) }
    : null
  if (!payment) {
    const { data, error } = await admin.from('siap_assistant_payment_subscriptions').insert({
      user_id:user.id, plan_key:plan.plan_key, amount:Number(plan.amount), payer_email:user.email,
      legal_accepted_at:new Date().toISOString(), terms_version:'2026-09-06', status:'creating'
    }).select('id,external_reference').single()
    if (error || !data) return json(request, { ok:false, code:'checkout_conflict' }, 409)
    payment = { id:String(data.id), external_reference:String(data.external_reference) }
  }

  if (!payment) return json(request, { ok:false, code:'checkout_conflict' }, 409)

  const response = await fetch('https://api.mercadopago.com/preapproval', {
    method:'POST',
    headers:{ Authorization:`Bearer ${mercadoPagoToken}`, 'Content-Type':'application/json', 'X-Idempotency-Key':payment.id },
    body:JSON.stringify({
      reason:`Assistente SIAP - ${plan.display_name}`,
      external_reference:payment.external_reference,
      payer_email:user.email,
      auto_recurring:{ frequency:Number(plan.billing_months), frequency_type:'months', transaction_amount:Number(plan.amount), currency_id:'BRL' },
      back_url:`${origin}/assistente-siap-conta.html?pagamento=retorno`,
      status:'pending',
    }),
  })
  const provider = await response.json().catch(() => ({}))
  if (!response.ok || !provider?.id || !provider?.init_point) {
    await admin.from('siap_assistant_payment_subscriptions').update({
      status:'failed', provider_status:String(provider?.status ?? `http_${response.status}`), updated_at:new Date().toISOString()
    }).eq('id', payment.id)
    return json(request, { ok:false, code:'provider_rejected_checkout' }, 502)
  }

  const { error:updateError } = await admin.from('siap_assistant_payment_subscriptions').update({
    provider_subscription_id:String(provider.id), provider_status:String(provider.status ?? 'pending'),
    status:'pending', checkout_url:String(provider.init_point), updated_at:new Date().toISOString()
  }).eq('id', payment.id)
  if (updateError) return json(request, { ok:false, code:'checkout_record_failed' }, 500)
  return json(request, { ok:true, checkoutUrl:String(provider.init_point), reused:false })
})
