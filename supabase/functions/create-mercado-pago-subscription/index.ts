import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean)
const cors = (request: Request): Record<string, string> => {
  const origin = request.headers.get('Origin') ?? ''
  return allowedOrigins().includes(origin) ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  } : {}
}
const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(request), 'Content-Type':'application/json' } })

Deno.serve(async request => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request, { error:'Origem não autorizada.' }, 403)
  if (request.method === 'OPTIONS') return new Response('ok', { headers:cors(request) })
  if (request.method !== 'POST') return json(request, { error:'Método não permitido.' }, 405)

  let applicationId: unknown
  try { ({ applicationId } = await request.json()) } catch { return json(request, { error:'Solicitação inválida.' }, 400) }
  if (typeof applicationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(applicationId)) {
    return json(request, { error:'Solicitação inválida.' }, 400)
  }

  const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
  if (!accessToken) return json(request, { error:'Pagamento ainda não configurado.' }, 503)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth:{ autoRefreshToken:false, persistSession:false }
  })

  const { data:application, error:applicationError } = await admin.from('platform_school_applications')
    .select('id, plan_key, school_name, email, status').eq('id', applicationId).maybeSingle()
  if (applicationError) return json(request, { error:'Não foi possível consultar a solicitação.' }, 500)
  if (!application || application.status !== 'pending') return json(request, { error:'Solicitação indisponível.' }, 404)
  if (!['basic','professional'].includes(application.plan_key)) {
    return json(request, { error:'Este plano não utiliza pagamento online.' }, 400)
  }

  const { data:plan, error:planError } = await admin.from('platform_plans')
    .select('plan_key, display_name, price, publicly_available')
    .eq('plan_key', application.plan_key).maybeSingle()
  if (planError || !plan || !plan.publicly_available || plan.price === null || Number(plan.price) <= 0) {
    return json(request, { error:'O plano escolhido não está disponível para contratação.' }, 400)
  }

  const { data:existing } = await admin.from('platform_payment_subscriptions')
    .select('id, external_reference, checkout_url, status').eq('application_id', application.id).maybeSingle()
  if (existing?.checkout_url && ['pending','authorized'].includes(existing.status)) {
    return json(request, { checkout_url:existing.checkout_url, reused:true })
  }
  if (existing && !['creating','failed'].includes(existing.status)) {
    return json(request, { error:'Esta solicitação de pagamento precisa de revisão.' }, 409)
  }
  if (existing?.status === 'failed') {
    await admin.from('platform_payment_subscriptions').update({ status:'creating', updated_at:new Date().toISOString() }).eq('id', existing.id)
    existing.status = 'creating'
  }

  let paymentRow = existing
  if (!paymentRow) {
    const { data:created, error:insertError } = await admin.from('platform_payment_subscriptions').insert({
      application_id:application.id,
      plan_key:application.plan_key,
      amount:Number(plan.price),
      payer_email:application.email,
      status:'creating',
    }).select('id, external_reference, checkout_url, status').single()
    if (insertError || !created) {
      const { data:concurrent } = await admin.from('platform_payment_subscriptions')
        .select('id, external_reference, checkout_url, status').eq('application_id', application.id).maybeSingle()
      if (concurrent?.checkout_url) return json(request, { checkout_url:concurrent.checkout_url, reused:true })
      if (!concurrent || concurrent.status !== 'creating') return json(request, { error:'Não foi possível iniciar a assinatura.' }, 409)
      paymentRow = concurrent
    } else {
      paymentRow = created
    }
  }
  if (!paymentRow) return json(request, { error:'Não foi possível iniciar a assinatura.' }, 500)

  const response = await fetch('https://api.mercadopago.com/preapproval', {
    method:'POST',
    headers:{
      'Authorization':`Bearer ${accessToken}`,
      'Content-Type':'application/json',
      'X-Idempotency-Key':paymentRow.id,
    },
    body:JSON.stringify({
      reason:`CARÔMETRO - Plano ${plan.display_name}`,
      external_reference:paymentRow.external_reference,
      payer_email:application.email,
      auto_recurring:{ frequency:1, frequency_type:'months', transaction_amount:Number(plan.price), currency_id:'BRL' },
      back_url:`${origin}/?pagamento=retorno`,
      status:'pending',
    })
  })
  const provider = await response.json().catch(() => ({}))
  if (!response.ok || !provider?.id || !provider?.init_point) {
    console.error('Mercado Pago recusou a criação da assinatura', {
      http_status:response.status,
      error:provider?.error ?? null,
      message:provider?.message ?? null,
      cause:Array.isArray(provider?.cause)
        ? provider.cause.map((item:Record<string, unknown>) => ({
            code:item?.code ?? null,
            description:item?.description ?? null,
          }))
        : [],
    })
    await admin.from('platform_payment_subscriptions').update({
      status:'failed', provider_status:provider?.status ?? `http_${response.status}`, updated_at:new Date().toISOString()
    }).eq('id', paymentRow.id)
    return json(request, { error:'O Mercado Pago não conseguiu iniciar a assinatura.' }, 502)
  }

  const { error:updateError } = await admin.from('platform_payment_subscriptions').update({
    provider_subscription_id:String(provider.id), provider_status:String(provider.status ?? 'pending'),
    status:'pending', checkout_url:String(provider.init_point), updated_at:new Date().toISOString()
  }).eq('id', paymentRow.id)
  if (updateError) return json(request, { error:'Assinatura criada, mas não foi possível registrar o retorno.' }, 500)
  return json(request, { checkout_url:String(provider.init_point), reused:false })
})
