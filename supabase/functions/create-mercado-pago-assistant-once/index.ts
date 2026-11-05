import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const origins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean)
const headers = (origin:string) => ({
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  Vary:'Origin',
})
const reply = (origin:string, body:Record<string,unknown>, status=200) =>
  new Response(JSON.stringify(body), { status, headers:headers(origin) })

Deno.serve(async request => {
  const origin=request.headers.get('Origin') ?? ''
  if (!origins().includes(origin)) return reply('',{ok:false,code:'forbidden_origin'},403)
  if (request.method==='OPTIONS') return new Response('ok',{headers:headers(origin)})
  if (request.method!=='POST') return reply(origin,{ok:false,code:'method_not_allowed'},405)
  const token=Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? ''
  const url=Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!token || !url || !anonKey || !serviceKey) return reply(origin,{ok:false,code:'server_not_configured'},503)

  let body:Record<string,unknown>
  try { body=await request.json() } catch { return reply(origin,{ok:false,code:'invalid_request'},400) }
  const planKey=String(body?.planKey ?? '')
  if (!['quarterly','semiannual','annual'].includes(planKey)) return reply(origin,{ok:false,code:'invalid_plan'},400)
  if (body?.legalAccepted!==true) return reply(origin,{ok:false,code:'legal_acceptance_required'},400)
  const caller=createClient(url,anonKey,{global:{headers:{Authorization:request.headers.get('Authorization') ?? ''}}})
  const {data:{user}}=await caller.auth.getUser()
  if (!user?.email) return reply(origin,{ok:false,code:'login_required'},401)
  const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:plan,error:planError}=await admin.from('siap_assistant_plans')
    .select('plan_key,display_name,amount,billing_months,active').eq('plan_key',planKey).maybeSingle()
  if (planError || !plan?.active || !Number.isFinite(Number(plan.amount)) || Number(plan.amount)<=0 || Number(plan.billing_months)!==({quarterly:3,semiannual:6,annual:12} as Record<string,number>)[planKey]) {
    return reply(origin,{ok:false,code:'plan_not_available'},409)
  }
  let {data:existing,error:existingError}=await admin.from('siap_assistant_payment_subscriptions')
    .select('id,provider,plan_key,amount,status,checkout_url,external_reference,provider_subscription_id,provider_checkout_id,current_period_end')
    .eq('user_id',user.id).in('status',['creating','pending','authorized','paused'])
    .order('created_at',{ascending:false}).limit(1).maybeSingle()
  if (existingError) return reply(origin,{ok:false,code:'checkout_lookup_failed'},500)
  if (existing?.status==='authorized' && existing.provider==='mercado_pago' && !existing.provider_subscription_id
      && existing.current_period_end && Date.parse(existing.current_period_end)<=Date.now()) {
    const {error:closeError}=await admin.from('siap_assistant_payment_subscriptions')
      .update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',existing.id).eq('status','authorized')
    if(closeError) return reply(origin,{ok:false,code:'checkout_conflict'},409)
    existing=null
  }
  if (existing && ['authorized','paused'].includes(existing.status)) return reply(origin,{ok:false,code:'subscription_already_exists'},409)
  if (existing && existing.provider!=='mercado_pago') return reply(origin,{ok:false,code:'other_checkout_pending'},409)
  if (existing && (existing.plan_key!==planKey || Number(existing.amount)!==Number(plan.amount))) {
    return reply(origin,{ok:false,code:'other_checkout_pending'},409)
  }
  if (existing?.provider==='mercado_pago' && existing.plan_key===planKey && Number(existing.amount)===Number(plan.amount) && existing.checkout_url) {
    return reply(origin,{ok:true,checkoutUrl:existing.checkout_url,reused:true})
  }
  if (existing?.checkout_url) return reply(origin,{ok:false,code:'other_checkout_pending'},409)
  const values={provider:'mercado_pago',plan_key:planKey,amount:Number(plan.amount),payer_email:user.email.toLowerCase(),
    legal_accepted_at:new Date().toISOString(),terms_version:'2026-09-06',status:'creating',
    checkout_url:null,provider_checkout_id:null,provider_subscription_id:null,updated_at:new Date().toISOString()}
  const save=existing
    ? await admin.from('siap_assistant_payment_subscriptions').update(values).eq('id',existing.id).select('id,external_reference').single()
    : await admin.from('siap_assistant_payment_subscriptions').insert({...values,user_id:user.id}).select('id,external_reference').single()
  if (save.error || !save.data) return reply(origin,{ok:false,code:'checkout_conflict'},409)
  const row=save.data
  const returnUrl=`${origin}/assistente-siap-conta.html?plano=${encodeURIComponent(planKey)}&pagamento=retorno`
  const notificationUrl=`${url}/functions/v1/siap-assistant-mercado-pago-webhook`
  const response=await fetch('https://api.mercadopago.com/checkout/preferences',{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Idempotency-Key':String(row.id)},
    body:JSON.stringify({
      items:[{id:`siap-${planKey}`,title:`Assistente SIAP - ${plan.display_name}`,description:`Acesso por ${plan.billing_months} meses, pagamento unico`,quantity:1,currency_id:'BRL',unit_price:Number(plan.amount)}],
      external_reference:String(row.external_reference),payer:{email:user.email},
      payment_methods:{installments:1},
      back_urls:{success:returnUrl,pending:returnUrl,failure:returnUrl},auto_return:'approved',
      notification_url:notificationUrl,
    }),
  })
  const provider=await response.json().catch(()=>({}))
  if (!response.ok || !provider?.id || !provider?.init_point) {
    await admin.from('siap_assistant_payment_subscriptions').update({status:'failed',provider_status:`http_${response.status}`,updated_at:new Date().toISOString()}).eq('id',row.id)
    return reply(origin,{ok:false,code:'provider_rejected_checkout'},502)
  }
  const {error:updateError}=await admin.from('siap_assistant_payment_subscriptions').update({
    status:'pending',provider_checkout_id:String(provider.id),checkout_url:String(provider.init_point),provider_status:'pending',updated_at:new Date().toISOString()
  }).eq('id',row.id)
  if (updateError) return reply(origin,{ok:false,code:'checkout_record_failed'},500)
  return reply(origin,{ok:true,checkoutUrl:String(provider.init_point),provider:'mercado_pago'})
})
