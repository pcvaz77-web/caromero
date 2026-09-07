import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { User } from 'https://esm.sh/@supabase/supabase-js@2'

type Json = Record<string, any>
const response=(body:Json,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})
const cleanEmail=(value:unknown)=>String(value??'').trim().toLowerCase()
const millisDate=(value:unknown)=>Number.isFinite(Number(value))?new Date(Number(value)).toISOString():null
const addUtcMonths=(value:Date,months:number)=>{const result=new Date(value);const day=result.getUTCDate();result.setUTCDate(1);result.setUTCMonth(result.getUTCMonth()+months);const lastDay=new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate();result.setUTCDate(Math.min(day,lastDay));return result}

Deno.serve(async request=>{
  if(request.method!=='POST') return response({ok:false},405)
  if(Number(request.headers.get('content-length')??0)>1_000_000) return response({ok:false},413)
  let raw:Json
  try{
    if((request.headers.get('content-type')??'').includes('application/json')) raw=await request.json()
    else raw=Object.fromEntries((await request.formData()).entries())
  }catch{return response({ok:false},400)}
  const expected=Deno.env.get('HOTMART_HOTTOK')??''
  const received=request.headers.get('x-hotmart-hottok')??String(raw.hottok??'')
  if(!expected||received!==expected) return response({ok:false},401)

  const legacyStatus=String(raw.status??'').toLowerCase()
  const legacyEvent:Record<string,string>={approved:'PURCHASE_APPROVED',completed:'PURCHASE_COMPLETE',canceled:'PURCHASE_CANCELED',cancelled:'PURCHASE_CANCELED',refunded:'PURCHASE_REFUNDED',chargeback:'PURCHASE_CHARGEBACK',expired:'PURCHASE_EXPIRED',delayed:'PURCHASE_DELAYED'}
  const isLegacy=raw.version!=='2.0.0'
  const event=isLegacy
    ? (String(raw.subscription_status??'').toLowerCase().includes('cancel')?'SUBSCRIPTION_CANCELLATION':legacyEvent[legacyStatus]??String(raw.event??'').toUpperCase())
    : String(raw.event??'')
  const data=isLegacy?{
    product:{id:Number(raw.prod)},
    buyer:{email:raw.email},
    purchase:{transaction:raw.transaction,status:legacyStatus,price:{value:Number(raw.price),currency_value:String(raw.currency_code_from??raw.currency??'BRL').toUpperCase()}},
    subscription:{id:raw.subscription_id,subscriber:{code:raw.subscriber_code}},
    subscriber:{code:raw.subscriber_code,email:raw.email},
    date_next_charge:raw.date_next_charge?Number(raw.date_next_charge):null
  }:(raw.data??{})
  const payload:Json=isLegacy?{version:'1.0.0',event,data,legacy:raw}:raw
  const productId=Number(data.product?.id)
  const eventId=String(raw.id??raw.event_id??`${event}:${raw.transaction??raw.subscription_id??''}:${productId}`)
  if(!event||!eventId||!Number.isSafeInteger(productId)) return response({ok:true,ignored:true,reason:'incomplete_event'})
  // Hotmart's Webhook 2.0 validation sends synthetic events with product.id = 0.
  // Acknowledge those tests without persisting or granting access. Real Hotmart
  // products always have a positive numeric id and continue through the normal flow.
  if(productId<=0) return response({ok:true,ignored:true,reason:'hotmart_test_event'})

  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{autoRefreshToken:false,persistSession:false}})
  const purchase=data.purchase??{}
  const transaction=String(purchase.transaction??'')
  const isCancellation=event==='SUBSCRIPTION_CANCELLATION'
  const subscriberCode=String((isCancellation?data.subscriber?.code:data.subscription?.subscriber?.code)??'')
  const buyerEmail=cleanEmail(isCancellation?data.subscriber?.email:data.buyer?.email)
  const {error:inboxError}=await admin.from('hotmart_webhook_events').insert({event_id:eventId,event_type:event,product_id:productId,transaction_id:transaction||null,subscriber_code:subscriberCode||null,buyer_email:buyerEmail||null,status:'received',payload})
  if(inboxError?.code==='23505') return response({ok:true,duplicate:true})
  if(inboxError) return response({ok:false},500)
  let mapping:Json|undefined
  const markInbox=async(status:string,error?:unknown,payment?:Json)=>admin.from('hotmart_webhook_events').update({status,processing_error:error?String(error).slice(0,1000):null,linked_target:payment?mapping?.target:null,linked_payment_id:payment?.id??null,processed_at:new Date().toISOString()}).eq('event_id',eventId)
  const {data:mappings}=await admin.from('hotmart_product_mappings').select('*').eq('product_id',productId).eq('active',true)
  const offerCode=String(purchase.offer?.code??data.subscription?.plan?.offer?.code??data.plan?.offer?.code??'')
  const amount=Number(purchase.price?.value??purchase.full_price?.value)
  mapping=(mappings??[]).find((item:Json)=>offerCode&&item.offer_code===offerCode)
    ??(mappings??[]).find((item:Json)=>Number.isFinite(amount)&&Math.abs(amount-Number(item.expected_amount))<=0.009)
    ??(mappings??[])[0]
  if(!mapping){await markInbox('ignored');return response({ok:true,ignored:true,reason:'unmapped_product'})}
  let activeMapping:Json=mapping

  const subscriptionId=String(data.subscription?.id??'')
  const resourceId=transaction||subscriberCode||subscriptionId||String(productId)
  const table=activeMapping.target==='school'?'platform_payment_subscriptions':'siap_assistant_payment_subscriptions'
  const eventsTable=activeMapping.target==='school'?'platform_payment_events':'siap_assistant_payment_events'

  let query=admin.from(table).select('*').eq('provider','hotmart')
  if(subscriberCode) query=query.eq('provider_subscriber_code',subscriberCode)
  else if(transaction) query=query.eq('provider_transaction_id',transaction)
  else query=query.eq('provider_checkout_id',String(productId)).eq('payer_email',buyerEmail).in('status',['pending','authorized','paused'])
  let {data:payment}=await query.order('created_at',{ascending:false}).limit(1).maybeSingle()
  if(!payment&&buyerEmail&&!isCancellation){
    const result=await admin.from(table).select('*').eq('provider','hotmart').eq('provider_checkout_id',String(productId)).eq('payer_email',buyerEmail).in('status',['pending','authorized','paused']).order('created_at',{ascending:false}).limit(1).maybeSingle()
    payment=result.data
  }
  if(!payment){await markInbox('unlinked');return response({ok:true,ignored:true,reason:'payment_not_linked'})}
  activeMapping=(mappings??[]).find((item:Json)=>item.billing_cycle===payment.billing_cycle)??activeMapping

  const eventRow={provider:'hotmart',provider_event_id:eventId,event_type:event,resource_id:resourceId,signature_valid:true,payload,processed:false,...(activeMapping.target==='school'?{action:event}:{})}
  const {error:eventError}=await admin.from(eventsTable).insert(eventRow)
  if(eventError?.code==='23505') return response({ok:true,duplicate:true})
  if(eventError) return response({ok:false},500)

  const markEvent=async(processed:boolean,error?:unknown)=>admin.from(eventsTable).update({processed,processing_error:error?String(error).slice(0,1000):null,processed_at:new Date().toISOString()}).eq('provider','hotmart').eq('provider_event_id',eventId).eq('event_type',event).eq('resource_id',resourceId)
  try{
    const approved=['PURCHASE_APPROVED','PURCHASE_COMPLETE'].includes(event)
    const revoked=['PURCHASE_REFUNDED','PURCHASE_CHARGEBACK','PURCHASE_CANCELED'].includes(event)
    if(approved){
      const currency=String(purchase.price?.currency_value??purchase.full_price?.currency_value??'BRL')
      if(!transaction||currency!=='BRL'||!Number.isFinite(amount)||Math.abs(amount-Number(activeMapping.expected_amount))>0.009) throw new Error('payment_mismatch')
      const alreadyActivated=payment.provider_transaction_id===transaction&&payment.last_payment_status==='approved'
      const changes={provider_subscription_id:subscriptionId||payment.provider_subscription_id,provider_subscriber_code:subscriberCode||payment.provider_subscriber_code,provider_transaction_id:transaction,last_payment_id:transaction,last_invoice_id:transaction,last_payment_status:'approved',provider_status:String(data.subscription?.status??purchase.status??event),status:'authorized',last_webhook_at:new Date().toISOString(),updated_at:new Date().toISOString()}
      const {error:updateError}=await admin.from(table).update(changes).eq('id',payment.id);if(updateError) throw updateError
      if(!alreadyActivated){
        const rpc=activeMapping.target==='school'?'platform_activate_paid_subscription':'siap_activate_paid_subscription'
        const args=activeMapping.target==='school'?{p_payment_subscription_id:payment.id}:{p_payment_subscription_id:payment.id,p_paid_at:new Date().toISOString()}
        const {data:activation,error}=await admin.rpc(rpc,args);if(error) throw error
        if(activeMapping.target==='school'){
          if(activation?.invitation_id) await sendAdministratorInvite(admin,activation.invitation_id)
          const schoolId=activation?.school_id??payment.school_id
          if(schoolId){
            const paidAtValue=Number(purchase.approved_date??Date.now())
            const paidAt=Number.isFinite(paidAtValue)?new Date(paidAtValue):new Date()
            const periodEnd=activeMapping.billing_cycle==='semiannual'?addUtcMonths(paidAt,6).toISOString():null
            const {error:accessError}=await admin.from('school_subscriptions').update({status:'active',grant_expires_at:periodEnd,updated_at:new Date().toISOString()}).eq('school_id',schoolId);if(accessError) throw accessError
            const {error:periodError}=await admin.from(table).update({current_period_end:periodEnd,updated_at:new Date().toISOString()}).eq('id',payment.id);if(periodError) throw periodError
          }
        }
      }else if(activeMapping.target==='school'&&payment.school_id){
        const {error:accessError}=await admin.rpc('platform_sync_paid_subscription_access',{p_payment_subscription_id:payment.id,p_access_active:true});if(accessError) throw accessError
      }
    }else if(isCancellation){
      const accessEndsAt=millisDate(data.date_next_charge)
      const {error}=await admin.from(table).update({status:'cancelled',provider_subscription_id:subscriptionId||payment.provider_subscription_id,provider_subscriber_code:subscriberCode||payment.provider_subscriber_code,provider_status:event,last_webhook_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',payment.id);if(error) throw error
      if(activeMapping.target==='school'&&payment.school_id&&accessEndsAt){
        const {error:subscriptionError}=await admin.from('school_subscriptions').update({grant_expires_at:accessEndsAt,updated_at:new Date().toISOString()}).eq('school_id',payment.school_id);if(subscriptionError) throw subscriptionError
      }
    }else if(revoked){
      const {error}=await admin.from(table).update({status:'cancelled',last_payment_status:event.toLowerCase(),provider_status:String(purchase.status??event),last_webhook_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',payment.id);if(error) throw error
      if(activeMapping.target==='school'){
        const {error:accessError}=await admin.rpc('platform_sync_paid_subscription_access',{p_payment_subscription_id:payment.id,p_access_active:false});if(accessError) throw accessError
      }else{
        const {error:licenseError}=await admin.from('siap_assistant_licenses').update({suspended_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('user_id',payment.user_id);if(licenseError) throw licenseError
      }
    }else{
      await admin.from(table).update({provider_status:String(purchase.status??event),last_webhook_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',payment.id)
    }
    await markEvent(true)
    await markInbox('processed',undefined,payment)
    return response({ok:true})
  }catch(error){
    await markEvent(false,error)
    await markInbox('failed',error,payment)
    return response({ok:false},500)
  }
})

async function sendAdministratorInvite(admin:any,invitationId:string){
  const {data:invitation,error}=await admin.from('school_invitations')
    .select('email,token,status,expires_at').eq('id',invitationId).single()
  if(error||!invitation||invitation.status!=='pending'||new Date(invitation.expires_at).getTime()<=Date.now()) throw new Error('administrator_invitation_unavailable')
  const site=(Deno.env.get('PUBLIC_SITE_URL')??'').replace(/\/$/,'')
  if(!site) throw new Error('public_site_url_not_configured')
  const redirectTo=`${site}/accept-invite.html?token=${invitation.token}`
  let target:User|undefined
  for(let page=1;page<=50&&!target;page+=1){
    const {data,error:listError}=await admin.auth.admin.listUsers({page,perPage:200})
    if(listError) throw listError
    target=data.users.find((user:User)=>user.email?.trim().toLowerCase()===invitation.email)
    if(data.users.length<200) break
  }
  if(!target){
    const {error:inviteError}=await admin.auth.admin.inviteUserByEmail(invitation.email,{redirectTo})
    if(inviteError) throw inviteError
    return
  }
  const anon=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!)
  const {error:otpError}=await anon.auth.signInWithOtp({email:invitation.email,options:{emailRedirectTo:redirectTo,shouldCreateUser:false}})
  if(otpError) throw otpError
}
