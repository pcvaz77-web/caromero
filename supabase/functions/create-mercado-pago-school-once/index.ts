import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const origins=()=> (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(v=>v.trim()).filter(Boolean)
const cors=(origin:string)=>({'Content-Type':'application/json','Access-Control-Allow-Origin':origin,
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',Vary:'Origin'})
const reply=(origin:string,body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:cors(origin)})
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async request=>{
  const origin=request.headers.get('Origin') ?? ''
  if(!origins().includes(origin)) return reply('',{error:'Origem não autorizada.'},403)
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors(origin)})
  if(request.method!=='POST') return reply(origin,{error:'Método não permitido.'},405)
  const token=Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? ''
  const url=Deno.env.get('SUPABASE_URL') ?? ''
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if(!token||!url||!service) return reply(origin,{error:'Pagamento ainda não configurado.'},503)
  let body:Record<string,unknown>
  try{body=await request.json()}catch{return reply(origin,{error:'Solicitação inválida.'},400)}
  const applicationId=String(body.applicationId ?? '')
  const billingCycle=String(body.billingCycle ?? '')
  const paymentMethod=String(body.paymentMethod ?? '')
  const cpf=String(body.cpf ?? '').replace(/\D/g,'')
  if(!uuid.test(applicationId)||!['semiannual','annual'].includes(billingCycle)
      ||(billingCycle==='annual'&&!['credit_card','pix'].includes(paymentMethod))
      ||(billingCycle==='semiannual'&&paymentMethod!=='any')
      ||(paymentMethod==='pix'&&cpf.length!==11)) {
    return reply(origin,{error:'Dados do pagamento inválidos.'},400)
  }
  if(billingCycle==='annual'&&paymentMethod==='credit_card'&&Deno.env.get('MP_ANNUAL_CARD_ENABLED')!=='true') {
    return reply(origin,{error:'O parcelamento anual ainda está em validação.'},503)
  }
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:application,error:applicationError}=await admin.from('platform_school_applications')
    .select('id,plan_key,school_name,responsible_name,email,status').eq('id',applicationId).maybeSingle()
  if(applicationError) return reply(origin,{error:'Não foi possível consultar a solicitação.'},500)
  if(!application||application.status!=='pending'||!['basic','professional'].includes(application.plan_key)
      ||(billingCycle==='annual'&&application.plan_key!=='professional')) {
    return reply(origin,{error:'Solicitação indisponível para este plano.'},404)
  }
  const {data:plan,error:planError}=await admin.from('platform_plans')
    .select('publicly_available,semiannual_price,semiannual_active,mercado_pago_semiannual_price,annual_card_price,annual_card_active,annual_pix_price')
    .eq('plan_key',application.plan_key).maybeSingle()
  if(planError||!plan?.publicly_available) return reply(origin,{error:'Plano indisponível.'},409)
  if(billingCycle==='semiannual'&&plan.semiannual_active!==true) return reply(origin,{error:'Oferta semestral indisponível.'},409)
  if(billingCycle==='annual'&&paymentMethod==='credit_card'&&plan.annual_card_active!==true) {
    return reply(origin,{error:'O parcelamento anual ainda está em validação.'},503)
  }
  const amount=Number(billingCycle==='semiannual'?(application.plan_key==='professional'?plan.mercado_pago_semiannual_price:plan.semiannual_price)
    :paymentMethod==='pix'?plan.annual_pix_price:plan.annual_card_price)
  if(!Number.isFinite(amount)||amount<=0) return reply(origin,{error:'Preço indisponível.'},409)
  const {data:existing,error:existingError}=await admin.from('platform_payment_subscriptions')
    .select('id,provider,status,billing_cycle,payment_method,amount,checkout_url,external_reference,provider_checkout_id')
    .eq('application_id',applicationId).maybeSingle()
  if(existingError) return reply(origin,{error:'Não foi possível consultar o pagamento.'},500)
  if(existing?.checkout_url && existing.provider==='mercado_pago' && existing.billing_cycle===billingCycle
    && existing.payment_method===paymentMethod && Number(existing.amount)===amount && existing.status==='pending') {
    return reply(origin,{checkout_url:existing.checkout_url,reused:true})
  }
  if(existing && existing.status!=='failed') return reply(origin,{error:'Já existe outro pagamento iniciado para esta escola.'},409)
  const values={provider:'mercado_pago',plan_key:application.plan_key,amount,payer_email:application.email,
    billing_cycle:billingCycle,period_months:billingCycle==='annual'?12:6,payment_method,
    status:'creating',checkout_url:null,provider_checkout_id:null,provider_subscription_id:null,
    updated_at:new Date().toISOString()}
  const saved=existing
    ? await admin.from('platform_payment_subscriptions').update(values).eq('id',existing.id).select('id,external_reference').single()
    : await admin.from('platform_payment_subscriptions').insert({...values,application_id:applicationId}).select('id,external_reference').single()
  if(saved.error||!saved.data) return reply(origin,{error:'Não foi possível iniciar o pagamento.'},409)
  const row=saved.data
  const description=`CARÔMETRO ${application.plan_key==='professional'?'Premium':'Básico'} - ${billingCycle==='annual'?'12':'6'} meses`
  let response:Response
  if(paymentMethod==='pix'){
    response=await fetch('https://api.mercadopago.com/v1/payments',{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Idempotency-Key':String(row.id)},
      body:JSON.stringify({transaction_amount:amount,description,payment_method_id:'pix',
        external_reference:String(row.external_reference),notification_url:`${url}/functions/v1/mercado-pago-webhook`,
        date_of_expiration:new Date(Date.now()+24*60*60*1000).toISOString(),
        payer:{email:application.email,first_name:String(application.responsible_name).split(/\s+/)[0],identification:{type:'CPF',number:cpf}}}),
    })
  }else{
    const exclusions=billingCycle==='annual'
      ? [{id:'ticket'},{id:'bank_transfer'},{id:'debit_card'},{id:'prepaid_card'}] : []
    response=await fetch('https://api.mercadopago.com/checkout/preferences',{
      method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-Idempotency-Key':String(row.id)},
      body:JSON.stringify({items:[{id:`carometro-${application.plan_key}-${billingCycle}`,title:description,quantity:1,currency_id:'BRL',unit_price:amount}],
        external_reference:String(row.external_reference),payer:{email:application.email},
        payment_methods:{installments:billingCycle==='annual'?12:1,excluded_payment_types:exclusions},
        back_urls:{success:`${origin}/?pagamento=retorno`,pending:`${origin}/?pagamento=retorno`,failure:`${origin}/?pagamento=retorno`},
        auto_return:'approved',notification_url:`${url}/functions/v1/mercado-pago-webhook`}),
    })
  }
  const provider=await response.json().catch(()=>({}))
  const checkoutUrl=paymentMethod==='pix'?provider?.point_of_interaction?.transaction_data?.ticket_url:provider?.init_point
  if(!response.ok||!provider?.id||!checkoutUrl||!String(checkoutUrl).startsWith('https://www.mercadopago.com.br/')){
    await admin.from('platform_payment_subscriptions').update({status:'failed',provider_status:`http_${response.status}`,updated_at:new Date().toISOString()}).eq('id',row.id)
    return reply(origin,{error:'O Mercado Pago não conseguiu criar a cobrança.'},502)
  }
  const {error:updateError}=await admin.from('platform_payment_subscriptions').update({
    status:'pending',provider_checkout_id:String(provider.id),checkout_url:String(checkoutUrl),
    provider_status:String(provider.status ?? 'pending'),updated_at:new Date().toISOString()
  }).eq('id',row.id)
  if(updateError) return reply(origin,{error:'Cobrança criada, mas não foi possível registrá-la.'},500)
  return reply(origin,{checkout_url:String(checkoutUrl),provider:'mercado_pago'})
})
