import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean)
const cors = (request:Request):Record<string,string> => {
  const origin=request.headers.get('Origin') ?? ''
  return allowedOrigins().includes(origin) ? {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'} : {}
}
const json=(request:Request,body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(request),'Content-Type':'application/json'}})

Deno.serve(async request => {
  const origin=request.headers.get('Origin') ?? ''
  if(!allowedOrigins().includes(origin)) return json(request,{error:'Origem nao autorizada.'},403)
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors(request)})
  if(request.method!=='POST') return json(request,{error:'Metodo nao permitido.'},405)
  let applicationId=''
  try { applicationId=String((await request.json())?.applicationId ?? '') } catch { return json(request,{error:'Solicitacao invalida.'},400) }
  if(!/^[0-9a-f-]{36}$/i.test(applicationId)) return json(request,{error:'Solicitacao invalida.'},400)

  const apiKey=Deno.env.get('ASAAS_API_KEY') ?? ''
  const apiUrl=Deno.env.get('ASAAS_API_URL') ?? 'https://api-sandbox.asaas.com/v3'
  if(!apiKey) return json(request,{error:'Asaas ainda nao configurado.'},503)
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:application}=await admin.from('platform_school_applications').select('id,plan_key,school_name,email,status').eq('id',applicationId).maybeSingle()
  if(!application || application.status!=='pending') return json(request,{error:'Solicitacao indisponivel.'},404)
  const {data:plan}=await admin.from('platform_plans').select('plan_key,display_name,price,publicly_available').eq('plan_key',application.plan_key).maybeSingle()
  if(!plan?.publicly_available || Number(plan.price)<=0) return json(request,{error:'Plano indisponivel.'},409)

  const {data:existing}=await admin.from('platform_payment_subscriptions').select('id,external_reference,checkout_url,status,provider').eq('application_id',application.id).maybeSingle()
  if(existing?.provider==='asaas' && existing.checkout_url && ['pending','authorized'].includes(existing.status)) return json(request,{checkout_url:existing.checkout_url,reused:true})
  if(existing && ['authorized','paused'].includes(existing.status)) return json(request,{error:'Pagamento precisa de revisao.'},409)
  if(existing?.provider==='asaas' && !['creating','pending','failed','cancelled'].includes(existing.status)) return json(request,{error:'Pagamento precisa de revisao.'},409)
  let row: {id:string;external_reference:string}|null=existing?{id:String(existing.id),external_reference:String(existing.external_reference)}:null
  if(row) {
    const {data}=await admin.from('platform_payment_subscriptions').update({provider:'asaas',status:'creating',checkout_url:null,provider_checkout_id:null,updated_at:new Date().toISOString()}).eq('id',row.id).select('id,external_reference').single()
    row=data
  } else {
    const {data}=await admin.from('platform_payment_subscriptions').insert({application_id:application.id,provider:'asaas',plan_key:plan.plan_key,amount:Number(plan.price),payer_email:application.email,status:'creating'}).select('id,external_reference').single()
    row=data
  }
  if(!row) return json(request,{error:'Nao foi possivel iniciar o pagamento.'},500)
  const providerResponse=await fetch(`${apiUrl}/paymentLinks`,{method:'POST',headers:{access_token:apiKey,'Content-Type':'application/json','User-Agent':'Carometro/1.0'},body:JSON.stringify({
    name:`CAROMETRO - ${plan.display_name}`,description:`Assinatura mensal do CAROMETRO para ${application.school_name}`,value:Number(plan.price),billingType:'UNDEFINED',chargeType:'RECURRENT',subscriptionCycle:'MONTHLY',dueDateLimitDays:7,externalReference:`carometro:${row.external_reference}`,notificationEnabled:true
  })})
  const provider=await providerResponse.json().catch(()=>({}))
  if(!providerResponse.ok || !provider?.id || !provider?.url) {
    const providerError=provider?.errors?.[0]
    const providerStatus=[providerError?.code,providerError?.description].filter(Boolean).join(': ').slice(0,500) || `http_${providerResponse.status}`
    await admin.from('platform_payment_subscriptions').update({status:'failed',provider_status:providerStatus,updated_at:new Date().toISOString()}).eq('id',row.id)
    return json(request,{error:'O Asaas nao conseguiu iniciar o pagamento.'},502)
  }
  await admin.from('platform_payment_subscriptions').update({provider:'asaas',provider_checkout_id:String(provider.id),provider_status:'ACTIVE',status:'pending',checkout_url:String(provider.url),updated_at:new Date().toISOString()}).eq('id',row.id)
  return json(request,{checkout_url:String(provider.url),reused:false,provider:'asaas'})
})
