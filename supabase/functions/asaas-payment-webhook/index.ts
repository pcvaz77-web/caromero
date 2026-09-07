import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
Deno.serve(async request=>{
  if(request.method!=='POST') return json({ok:false},405)
  const expected=Deno.env.get('ASAAS_WEBHOOK_TOKEN')??''
  const received=request.headers.get('asaas-access-token')??''
  if(!expected || received!==expected) return json({ok:false},401)
  let payload:Record<string,any>; try{payload=await request.json()}catch{return json({ok:false},400)}
  const event=String(payload.event??''), payment=payload.payment??{}, resourceId=String(payment.id??'')
  const reference=String(payment.externalReference??'')
  if(!event||!resourceId||!reference) return json({ok:true,ignored:true})
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{autoRefreshToken:false,persistSession:false}})
  const isSchool=reference.startsWith('carometro:')
  const table=isSchool?'platform_payment_subscriptions':'siap_assistant_payment_subscriptions'
  const eventsTable=isSchool?'platform_payment_events':'siap_assistant_payment_events'
  const lookupReference=isSchool?reference.slice('carometro:'.length):reference
  const {data:row}=await admin.from(table).select('*').eq('external_reference',lookupReference).maybeSingle()
  if(!row) return json({ok:true,ignored:true})
  const eventId=String(payload.id??`${event}:${resourceId}`)
  const baseEvent={provider_event_id:eventId,event_type:event,resource_id:resourceId,signature_valid:true,payload,processed:false}
  const eventInsert=isSchool?{...baseEvent,provider:'asaas',action:event}:{...baseEvent,provider:'asaas'}
  const {error:eventError}=await admin.from(eventsTable).insert(eventInsert)
  if(eventError?.code==='23505') return json({ok:true,duplicate:true})
  if(eventError) return json({ok:false},500)
  try{
    if(['PAYMENT_CONFIRMED','PAYMENT_RECEIVED'].includes(event)){
      if(String(payment.currency??'BRL')!=='BRL'||Math.abs(Number(payment.value)-Number(row.amount))>0.009) throw new Error('payment_mismatch')
      await admin.from(table).update({provider:'asaas',provider_subscription_id:payment.subscription?String(payment.subscription):row.provider_subscription_id,last_payment_id:resourceId,last_invoice_id:String(payment.invoiceNumber??resourceId),last_payment_status:'approved',provider_status:String(payment.status??event),status:'authorized',last_webhook_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',row.id)
      if(isSchool){const {error}=await admin.rpc('platform_activate_paid_subscription',{p_payment_subscription_id:row.id});if(error) throw error}
      else{const {error}=await admin.rpc('siap_activate_paid_subscription',{p_payment_subscription_id:row.id,p_paid_at:new Date().toISOString()});if(error) throw error}
    } else if(['PAYMENT_OVERDUE','PAYMENT_DELETED','PAYMENT_REFUNDED','PAYMENT_CHARGEBACK_REQUESTED'].includes(event)){
      await admin.from(table).update({provider_status:String(payment.status??event),last_payment_status:event.toLowerCase(),last_webhook_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',row.id)
    }
    await admin.from(eventsTable).update({processed:true,processed_at:new Date().toISOString()}).eq('provider_event_id',eventId).eq('event_type',event).eq('resource_id',resourceId)
    return json({ok:true})
  }catch(error){
    await admin.from(eventsTable).update({processing_error:String(error),processed_at:new Date().toISOString()}).eq('provider_event_id',eventId).eq('event_type',event).eq('resource_id',resourceId)
    return json({ok:false},500)
  }
})
