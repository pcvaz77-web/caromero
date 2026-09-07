import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const allowedOrigins=()=> (Deno.env.get('ALLOWED_ORIGINS')??'').split(',').map(v=>v.trim()).filter(Boolean)
const cors=(r:Request):Record<string,string>=>{const o=r.headers.get('Origin')??'';return allowedOrigins().includes(o)?{'Access-Control-Allow-Origin':o,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}:{}}
const json=(r:Request,b:Record<string,unknown>,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),'Content-Type':'application/json'}})
Deno.serve(async request=>{
  const origin=request.headers.get('Origin')??''
  if(!allowedOrigins().includes(origin)) return json(request,{ok:false,code:'forbidden_origin'},403)
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors(request)})
  if(request.method!=='POST') return json(request,{ok:false,code:'method_not_allowed'},405)
  const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const caller=createClient(url,anon,{global:{headers:{Authorization:request.headers.get('Authorization')??''}}})
  const {data:{user}}=await caller.auth.getUser(); if(!user?.email) return json(request,{ok:false,code:'login_required'},401)
  let planKey='',legalAccepted=false; try{const b=await request.json();planKey=String(b?.planKey??'');legalAccepted=b?.legalAccepted===true}catch{}
  if(!legalAccepted) return json(request,{ok:false,code:'legal_acceptance_required'},400)
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:plan}=await admin.from('siap_assistant_plans').select('*').eq('plan_key',planKey).maybeSingle()
  if(!plan?.active || Number(plan.amount)<=0) return json(request,{ok:false,code:'plan_not_available'},409)
  const {data:existing}=await admin.from('siap_assistant_payment_subscriptions').select('*').eq('user_id',user.id).in('status',['creating','pending','authorized','paused']).order('created_at',{ascending:false}).limit(1).maybeSingle()
  if(existing?.provider==='asaas' && existing.checkout_url) return json(request,{ok:true,checkoutUrl:existing.checkout_url,reused:true})
  if(existing?.status==='authorized'||existing?.status==='paused') return json(request,{ok:false,code:'subscription_already_exists'},409)
  let row=existing
  if(row){const {data}=await admin.from('siap_assistant_payment_subscriptions').update({provider:'asaas',plan_key:plan.plan_key,amount:Number(plan.amount),status:'creating',checkout_url:null,provider_checkout_id:null,legal_accepted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',row.id).select('*').single();row=data}
  else{const {data}=await admin.from('siap_assistant_payment_subscriptions').insert({user_id:user.id,provider:'asaas',plan_key:plan.plan_key,amount:Number(plan.amount),payer_email:user.email,legal_accepted_at:new Date().toISOString(),terms_version:'2026-09-06',status:'creating'}).select('*').single();row=data}
  if(!row) return json(request,{ok:false,code:'checkout_conflict'},409)
  const apiKey=Deno.env.get('ASAAS_API_KEY')??'',apiUrl=Deno.env.get('ASAAS_API_URL')??'https://api-sandbox.asaas.com/v3'
  const isSemiannual=Number(plan.billing_months)===6
  const paymentLink={name:`Assistente SIAP - ${plan.display_name}`,description:'Licenca individual do Assistente SIAP',value:Number(plan.amount),billingType:'UNDEFINED',chargeType:isSemiannual?'DETACHED':'RECURRENT',...(isSemiannual?{}:{subscriptionCycle:'MONTHLY'}),dueDateLimitDays:7,externalReference:row.external_reference,notificationEnabled:true}
  const pr=await fetch(`${apiUrl}/paymentLinks`,{method:'POST',headers:{access_token:apiKey,'Content-Type':'application/json','User-Agent':'Assistente-SIAP/1.0'},body:JSON.stringify(paymentLink)})
  const provider=await pr.json().catch(()=>({})); if(!pr.ok||!provider?.id||!provider?.url){const providerError=provider?.errors?.[0];const providerStatus=[providerError?.code,providerError?.description].filter(Boolean).join(': ').slice(0,500)||`http_${pr.status}`;await admin.from('siap_assistant_payment_subscriptions').update({status:'failed',provider_status:providerStatus,updated_at:new Date().toISOString()}).eq('id',row.id);return json(request,{ok:false,code:'provider_rejected_checkout'},502)}
  await admin.from('siap_assistant_payment_subscriptions').update({provider:'asaas',provider_checkout_id:String(provider.id),provider_status:'ACTIVE',status:'pending',checkout_url:String(provider.url),updated_at:new Date().toISOString()}).eq('id',row.id)
  return json(request,{ok:true,checkoutUrl:String(provider.url),reused:false,provider:'asaas'})
})
