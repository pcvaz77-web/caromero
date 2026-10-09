import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const origins=()=> [...(Deno.env.get('ALLOWED_ORIGINS')||'').split(',').map(v=>v.trim()),...['fgpjjlikinpcjpmmjehbgbfonnbfibnc','mohcmojnkjjkphgjaogcbokjmnijmggl','iobkgohpoeoimlhlgdeiojlghbhcijli','bfbjocbablljmknahhlkjhllpjmihibe'].map(id=>'chrome-extension://'+id)];
const reply=(body:unknown,status=200,origin='')=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(origins().includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-assistant-session','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}:{})}});
Deno.serve(async request=>{
 const origin=request.headers.get('Origin')||'';
 if(request.method==='OPTIONS') return reply({},200,origin);
 if(request.method!=='POST') return reply({},405,origin);
 if(Number(request.headers.get('content-length'))>1000000) return reply({},413,origin);
 let body;try{body=await request.json();}catch{return reply({},400,origin);}
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 try {
 if(body.action==='checkout'||body.action==='status') {
  if(!origins().includes(origin)) return reply({},403);
  const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:request.headers.get('Authorization')||''}}});
  let user;
  const device=request.headers.get('X-Assistant-Session');
  if(device) {
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(device)))].map(x=>x.toString(16).padStart(2,'0')).join('');
   const {data:s}=await admin.from('siap_assistant_device_sessions').select('user_id,expires_at,revoked_at').eq('token_hash',hash).maybeSingle();
   if(s&&!s.revoked_at&&Date.parse(s.expires_at)>Date.now()) user=(await admin.auth.admin.getUserById(s.user_id)).data.user;
  } else user=(await caller.auth.getUser()).data.user;
  if(!user?.email) return reply({code:'login_required'},401,origin);
  if(body.action==='status') {
   const {data,error}=await admin.rpc('siap_exam_commerce_access',{p_user:user.id});
   return reply(error?{code:'unavailable'}:{ok:true,access:data},error?503:200,origin);
  }
  // Correção agora integra o Carômetro. Mantemos status e webhooks para
  // contratos já comprados, mas não abrimos novos checkouts deste produto.
  return reply({code:'plan_not_available'},409,origin);
 }
 const secret=Deno.env.get('HOTMART_HOTTOK');
 if(!secret||request.headers.get('x-hotmart-hottok')!==secret) return reply({},401);
 if(body.version!=='2.0.0') return reply({code:'version_required'},400);
 const approved=['PURCHASE_APPROVED','PURCHASE_COMPLETE'].includes(body.event);
 const revoked=['PURCHASE_REFUNDED','PURCHASE_CHARGEBACK','PURCHASE_CANCELED'].includes(body.event);
 if(!approved&&!revoked) return reply({ok:true,ignored:true}); // Cancellation stops future renewal; paid period remains.
 const d=body.data||{},p=d.purchase||{},transaction=String(p.transaction||'');
 if(!transaction||!Number.isSafeInteger(d.product?.id)||d.product.id<=0) return reply({ok:true,ignored:true});
 // A refund uses the original transaction even if the offer was deactivated.
 const {data:existing,error:existingError}=await admin.from('siap_exam_purchases').select('order_id').eq('transaction_id',transaction).maybeSingle();
 if(existingError) throw existingError;
 let order;
 if(existing){
  const result=await admin.from('siap_exam_orders').select('*').eq('id',existing.order_id).maybeSingle();if(result.error) throw result.error;order=result.data;
 } else {
  const email=String(d.buyer?.email||'').trim().toLowerCase();
  const result=await admin.from('siap_exam_orders').select('*').eq('product_id',d.product.id).eq('offer_code',String(p.offer?.code||'')).eq('payer_email',email).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(result.error) throw result.error;order=result.data;
 }
 if(!order) return reply({code:'payment_not_linked'},409);
 if(Number(order.product_id)!==d.product.id) return reply({code:'product_mismatch'},409);
 // Hotmart confirms the payment, regardless of the method enabled in its checkout.
 if(approved && (p.offer?.code!==order.offer_code||p.price?.currency_value!=='BRL'||Number(p.price?.value)!==Number(order.amount))) return reply({code:'payment_mismatch'},409);
 const paidAt=Number(p.approved_date);
 if(approved&&(!Number.isFinite(paidAt)||paidAt<=0)) return reply({code:'missing_approval_date'},409);
 const {error}=await admin.rpc('siap_exam_payment_event',{p_order:order.id,p_transaction:transaction,p_amount:Number(p.price?.value)||0,p_event:approved?'approved':'revoked',p_paid_at:approved?new Date(paidAt).toISOString():null});
 if(error) throw error;
 return reply({ok:true});
 } catch { return reply({code:'processing_failed'},503,origin); }
});
