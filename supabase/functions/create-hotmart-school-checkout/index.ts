import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const allowedOrigins=()=> (Deno.env.get('ALLOWED_ORIGINS')??'').split(',').map(v=>v.trim()).filter(Boolean)
const cors=(r:Request):Record<string,string>=>{const o=r.headers.get('Origin')??'';return allowedOrigins().includes(o)?{'Access-Control-Allow-Origin':o,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}:{}}
const json=(r:Request,b:Record<string,unknown>,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),'Content-Type':'application/json'}})
Deno.serve(async request=>{
  const origin=request.headers.get('Origin')??''
  if(!allowedOrigins().includes(origin)) return json(request,{error:'Origem nao autorizada.'},403)
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors(request)})
  if(request.method!=='POST') return json(request,{error:'Metodo nao permitido.'},405)
  let applicationId='',billingCycle='monthly';try{const body=await request.json();applicationId=String(body?.applicationId??'');billingCycle=String(body?.billingCycle??'monthly')}catch{return json(request,{error:'Solicitacao invalida.'},400)}
  if(!/^[0-9a-f-]{36}$/i.test(applicationId)) return json(request,{error:'Solicitacao invalida.'},400)
  if(!['monthly','semiannual'].includes(billingCycle)) return json(request,{error:'Ciclo de cobranca invalido.'},400)
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:a}=await admin.from('platform_school_applications').select('id,plan_key,email,status').eq('id',applicationId).maybeSingle()
  if(!a||a.status!=='pending') return json(request,{error:'Solicitacao indisponivel.'},404)
  const {data:plan}=await admin.from('platform_plans').select('price,semiannual_price,semiannual_active').eq('plan_key',a.plan_key).maybeSingle()
  const {data:m}=await admin.from('hotmart_product_mappings').select('*').eq('target','school').eq('plan_key',a.plan_key).eq('billing_cycle',billingCycle).eq('active',true).maybeSingle()
  if(!m) return json(request,{error:'Checkout Hotmart ainda nao configurado para este plano.'},409)
  const catalogAmount=billingCycle==='semiannual'?Number(plan?.semiannual_price):Number(plan?.price)
  if(!plan||(billingCycle==='semiannual'&&plan.semiannual_active!==true)||!Number.isFinite(catalogAmount)||Math.abs(catalogAmount-Number(m.expected_amount))>0.009) return json(request,{error:'O preco deste plano precisa ser sincronizado com a oferta da Hotmart.'},409)
  const {data:e}=await admin.from('platform_payment_subscriptions').select('*').eq('application_id',a.id).maybeSingle()
  if(e&&['authorized','paused'].includes(e.status)) return json(request,{error:'Pagamento precisa de revisao.'},409)
  const values={provider:'hotmart',plan_key:m.plan_key,amount:Number(m.expected_amount),payer_email:a.email,billing_cycle:m.billing_cycle,period_months:m.billing_cycle==='semiannual'?6:1,status:'pending',checkout_url:m.checkout_url,provider_checkout_id:String(m.product_id),provider_status:'AWAITING_HOTMART',updated_at:new Date().toISOString()}
  const result=e?await admin.from('platform_payment_subscriptions').update(values).eq('id',e.id):await admin.from('platform_payment_subscriptions').insert({...values,application_id:a.id})
  if(result.error) return json(request,{error:'Nao foi possivel preparar o pagamento.'},500)
  return json(request,{checkout_url:m.checkout_url,provider:'hotmart'})
})
