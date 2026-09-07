import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean)
const cors = (request: Request): Record<string, string> => {
  const origin = request.headers.get('Origin') ?? ''
  return allowedOrigins().includes(origin) ? {
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS', Vary:'Origin',
  } : {}
}
const json = (request:Request, body:Record<string,unknown>, status=200) =>
  new Response(JSON.stringify(body), { status, headers:{ ...cors(request), 'Content-Type':'application/json' } })

Deno.serve(async request => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request, { ok:false, code:'forbidden_origin' }, 403)
  if (request.method === 'OPTIONS') return new Response('ok', { headers:cors(request) })
  if (request.method !== 'POST') return json(request, { ok:false, code:'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const mercadoPagoToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? ''
  const caller = createClient(url, anonKey, { global:{ headers:{ Authorization:request.headers.get('Authorization') ?? '' } } })
  const { data:{ user } } = await caller.auth.getUser()
  if (!user || !serviceKey || !mercadoPagoToken) return json(request, { ok:false, code:'login_required' }, 401)

  const admin = createClient(url, serviceKey, { auth:{ autoRefreshToken:false, persistSession:false } })
  const { data:subscription, error } = await admin.from('siap_assistant_payment_subscriptions')
    .select('id,provider_subscription_id,status,current_period_end').eq('user_id', user.id)
    .in('status', ['pending','authorized','paused']).order('created_at', { ascending:false }).limit(1).maybeSingle()
  if (error) return json(request, { ok:false, code:'subscription_lookup_failed' }, 500)
  if (!subscription) return json(request, { ok:false, code:'subscription_not_found' }, 404)

  if (subscription.provider_subscription_id && subscription.status !== 'cancelled') {
    const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(subscription.provider_subscription_id)}`, {
      method:'PUT', headers:{ Authorization:`Bearer ${mercadoPagoToken}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ status:'cancelled' }),
    })
    if (!response.ok) return json(request, { ok:false, code:'provider_cancel_failed' }, 502)
  }
  await admin.from('siap_assistant_payment_subscriptions').update({ status:'cancelled', provider_status:'cancelled', updated_at:new Date().toISOString() }).eq('id', subscription.id)
  return json(request, { ok:true, cancelled:true, accessUntil:subscription.current_period_end })
})
