import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean)
const headers = (origin:string) => ({
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  Vary:'Origin',
})
const reply = (origin:string, body:Record<string,unknown>, status=200) =>
  new Response(JSON.stringify(body), {status, headers:headers(origin)})

const providerJson = async (path:string, token:string, init?:RequestInit) => {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init, headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json', ...init?.headers},
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw Error(`mercado_pago_${response.status}`)
  return body
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return reply('', {ok:false,code:'forbidden_origin'}, 403)
  if (request.method === 'OPTIONS') return new Response('ok', {headers:headers(origin)})
  if (request.method !== 'POST') return reply(origin, {ok:false,code:'method_not_allowed'}, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const mercadoPagoToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? ''
  if (!url || !anonKey || !serviceKey || !mercadoPagoToken) return reply(origin, {ok:false,code:'server_not_configured'}, 503)

  const caller = createClient(url, anonKey, {global:{headers:{Authorization:request.headers.get('Authorization') ?? ''}}})
  const {data:{user},error:userError} = await caller.auth.getUser()
  if (userError || !user?.id) return reply(origin, {ok:false,code:'login_required'}, 401)

  const admin = createClient(url, serviceKey, {auth:{autoRefreshToken:false,persistSession:false}})
  const {data:payment,error:lookupError} = await admin.from('siap_assistant_payment_subscriptions')
    .select('id,provider,plan_key,status,amount,currency,external_reference,provider_checkout_id,provider_subscription_id')
    .eq('user_id',user.id).eq('provider','mercado_pago').eq('status','pending')
    .order('created_at',{ascending:false}).limit(1).maybeSingle()
  if (lookupError) return reply(origin, {ok:false,code:'checkout_lookup_failed'}, 500)
  if (!payment) return reply(origin, {ok:false,code:'pending_payment_not_found'}, 404)

  try {
    if (payment.plan_key === 'monthly') {
      if (!payment.provider_subscription_id) return reply(origin, {ok:false,code:'checkout_not_ready'}, 409)
      const path = `/preapproval/${encodeURIComponent(payment.provider_subscription_id)}`
      const remote = await providerJson(path,mercadoPagoToken)
      if (String(remote.external_reference ?? '') !== String(payment.external_reference)) throw Error('subscription_mismatch')
      if (!['pending','cancelled','canceled'].includes(String(remote.status ?? ''))) {
        return reply(origin, {ok:false,code:'payment_in_progress'}, 409)
      }
      if (remote.status === 'pending') {
        await providerJson(path,mercadoPagoToken,{method:'PUT',body:JSON.stringify({status:'cancelled'})})
        const verified = await providerJson(path,mercadoPagoToken)
        if (!['cancelled','canceled'].includes(String(verified.status ?? ''))) throw Error('subscription_still_active')
      }
    } else {
      if (!['quarterly','semiannual','annual'].includes(payment.plan_key) || !payment.provider_checkout_id) {
        return reply(origin, {ok:false,code:'checkout_not_ready'}, 409)
      }
      const searchPath = `/v1/payments/search?external_reference=${encodeURIComponent(payment.external_reference)}&limit=100`
      const search = await providerJson(searchPath,mercadoPagoToken)
      if (!Array.isArray(search.results) || Number(search.paging?.total ?? 0) > search.results.length) throw Error('payment_search_incomplete')
      const active = search.results.filter((item:Record<string,unknown>) =>
        String(item.external_reference ?? '') === String(payment.external_reference)
        && !['rejected','cancelled','canceled','refunded','charged_back'].includes(String(item.status ?? '')))
      if (active.some((item:Record<string,unknown>) => !['pending','in_process','authorized'].includes(String(item.status ?? '')))) {
        return reply(origin, {ok:false,code:'payment_in_progress'}, 409)
      }
      const path = `/checkout/preferences/${encodeURIComponent(payment.provider_checkout_id)}`
      const preference = await providerJson(path,mercadoPagoToken)
      if (String(preference.external_reference ?? '') !== String(payment.external_reference)) throw Error('preference_mismatch')
      if (preference.preference_expired !== true) {
        const created = Date.parse(String(preference.date_created ?? ''))
        if (!Number.isFinite(created)) throw Error('preference_creation_date_missing')
        await providerJson(path,mercadoPagoToken,{method:'PUT',body:JSON.stringify({
          expires:true,
          expiration_date_from:new Date(created).toISOString(),
          expiration_date_to:new Date().toISOString(),
        })})
        const verified = await providerJson(path,mercadoPagoToken)
        if (verified.preference_expired !== true) throw Error('preference_still_active')
      }
      for (const item of active) {
        const paymentPath = `/v1/payments/${encodeURIComponent(String(item.id))}`
        const current = await providerJson(paymentPath,mercadoPagoToken)
        if (String(current.external_reference ?? '') !== String(payment.external_reference)
            || String(current.currency_id ?? '') !== String(payment.currency)
            || !Number.isFinite(Number(current.transaction_amount))
            || Math.abs(Number(current.transaction_amount)-Number(payment.amount)) >= 0.009) throw Error('payment_mismatch')
        if (['cancelled','canceled','rejected'].includes(String(current.status ?? ''))) continue
        if (!['pending','in_process','authorized'].includes(String(current.status ?? ''))) {
          return reply(origin, {ok:false,code:'payment_in_progress'}, 409)
        }
        await providerJson(paymentPath,mercadoPagoToken,{method:'PUT',body:JSON.stringify({status:'cancelled'})})
        const verified = await providerJson(paymentPath,mercadoPagoToken)
        if (!['cancelled','canceled'].includes(String(verified.status ?? ''))) throw Error('payment_still_active')
      }
      const finalSearch = await providerJson(searchPath,mercadoPagoToken)
      if (!Array.isArray(finalSearch.results) || Number(finalSearch.paging?.total ?? 0) > finalSearch.results.length) throw Error('final_payment_search_incomplete')
      if (finalSearch.results.some((item:Record<string,unknown>) =>
        String(item.external_reference ?? '') === String(payment.external_reference)
        && !['rejected','cancelled','canceled','refunded','charged_back'].includes(String(item.status ?? '')))) {
        return reply(origin, {ok:false,code:'payment_in_progress'}, 409)
      }
    }

    const {data:cancelled,error:cancelError} = await admin.from('siap_assistant_payment_subscriptions')
      .update({status:'cancelled',provider_status:'CANCELLED_BY_CUSTOMER',updated_at:new Date().toISOString()})
      .eq('id',payment.id).eq('status','pending').select('id').maybeSingle()
    if (cancelError) throw cancelError
    if (!cancelled) return reply(origin, {ok:false,code:'payment_in_progress'}, 409)
    return reply(origin, {ok:true,cancelled:true})
  } catch (error) {
    console.error('Could not cancel Assistant checkout',error instanceof Error ? error.message : 'unknown')
    return reply(origin, {ok:false,code:'provider_cancel_failed'}, 502)
  }
})
