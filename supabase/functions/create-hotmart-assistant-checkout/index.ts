import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const allowedOrigins=()=> (Deno.env.get('ALLOWED_ORIGINS')??'').split(',').map(v=>v.trim()).filter(Boolean)
const cors=(r:Request):Record<string,string>=>{const o=r.headers.get('Origin')??'';return allowedOrigins().includes(o)?{'Access-Control-Allow-Origin':o,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'}:{}}
const json=(r:Request,b:Record<string,unknown>,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors(r),'Content-Type':'application/json'}})
Deno.serve(async request=>{
  const origin=request.headers.get('Origin')??''
  if(!allowedOrigins().includes(origin)) return json(request,{ok:false,code:'forbidden_origin'},403)
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors(request)})
  if(request.method!=='POST') return json(request,{ok:false,code:'method_not_allowed'},405)
  const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const caller=createClient(url,anon,{global:{headers:{Authorization:request.headers.get('Authorization')??''}}});const {data:{user}}=await caller.auth.getUser()
  if(!user?.email) return json(request,{ok:false,code:'login_required'},401)
  let planKey='',legalAccepted=false;try{const b=await request.json();planKey=String(b?.planKey??'');legalAccepted=b?.legalAccepted===true}catch{}
  if(!legalAccepted) return json(request,{ok:false,code:'legal_acceptance_required'},400)
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:m}=await admin.from('hotmart_product_mappings').select('*').eq('target','assistant').eq('plan_key',planKey).eq('active',true).maybeSingle()
  if(!m) return json(request,{ok:false,code:'plan_not_available'},409)
  const {data:e}=await admin.from('siap_assistant_payment_subscriptions').select('*').eq('user_id',user.id).in('status',['creating','pending','authorized','paused']).order('created_at',{ascending:false}).limit(1).maybeSingle()
  if(e&&['authorized','paused'].includes(e.status)) return json(request,{ok:false,code:'subscription_already_exists'},409)
  const values={provider:'hotmart',plan_key:m.plan_key,amount:Number(m.expected_amount),payer_email:user.email.toLowerCase(),legal_accepted_at:new Date().toISOString(),terms_version:'2026-09-06',status:'pending',checkout_url:m.checkout_url,provider_checkout_id:String(m.product_id),provider_status:'AWAITING_HOTMART',updated_at:new Date().toISOString()}
  const result=e?await admin.from('siap_assistant_payment_subscriptions').update(values).eq('id',e.id):await admin.from('siap_assistant_payment_subscriptions').insert({...values,user_id:user.id})
  if(result.error) return json(request,{ok:false,code:'checkout_conflict'},409)
  return json(request,{ok:true,checkoutUrl:m.checkout_url,provider:'hotmart'})
})
