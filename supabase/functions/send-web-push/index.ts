import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

type NotificationRow = { id:number; recipient_id:string; school_id:string; title:string; body:string; class_id?:string|null }
type WebhookPayload = { type:'INSERT'; table:'user_notifications'; record:NotificationRow }

const MAX_TRANSIENT_ATTEMPTS = 3
const RETRY_DELAYS_MS = [350, 900]
const sleep = (milliseconds:number) => new Promise(resolve => setTimeout(resolve, milliseconds))
const statusCodeOf = (error:unknown) => (error as {statusCode?:number})?.statusCode
const isGone = (error:unknown) => [404, 410].includes(statusCodeOf(error) ?? 0)
const isTransient = (error:unknown) => {
  const status = statusCodeOf(error)
  return status == null || status === 408 || status === 425 || status === 429 || status >= 500
}

async function deliverWithBoundedRetry(subscription:{endpoint:string;p256dh:string;auth_key:string},message:string){
  let lastError:unknown
  for(let attempt=1;attempt<=MAX_TRANSIENT_ATTEMPTS;attempt++){
    try{
      await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth_key}},message)
      return {delivered:true,error:null}
    }catch(error){
      lastError=error
      if(isGone(error)||!isTransient(error)||attempt===MAX_TRANSIENT_ATTEMPTS)break
      await sleep(RETRY_DELAYS_MS[attempt-1])
    }
  }
  return {delivered:false,error:lastError}
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed',{status:405})
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return new Response('Unauthorized',{status:401})
  const payload = await request.json() as WebhookPayload
  if (payload.type !== 'INSERT' || payload.table !== 'user_notifications') return Response.json({ignored:true})
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY')!,privateKey=Deno.env.get('VAPID_PRIVATE_KEY')!
  webpush.setVapidDetails('mailto:administrador@carometro.app',publicKey,privateKey)
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const {data:canReceive,error:accessError}=await admin.rpc('can_receive_school_notification',{target_user_id:payload.record.recipient_id,target_school_id:payload.record.school_id})
  if(accessError) return Response.json({error:accessError.message},{status:500})
  if(!canReceive) return Response.json({ignored:true,reason:'recipient_without_effective_school_access'})
  const {data:subscriptions,error}=await admin.from('push_subscriptions').select('*').eq('user_id',payload.record.recipient_id).eq('enabled',true)
  if(error) return Response.json({error:error.message},{status:500})
  const message=JSON.stringify({title:payload.record.title,body:payload.record.body,tag:`carometro-${payload.record.id}`,url:`./?notification=${payload.record.id}`})
  let delivered=0
  for(const subscription of subscriptions||[]){
    const result=await deliverWithBoundedRetry(subscription,message)
    if(result.delivered){delivered++;continue}
    if(isGone(result.error))await admin.from('push_subscriptions').delete().eq('id',subscription.id)
    else console.error('Falha no push após tentativas limitadas',{notificationId:payload.record.id,subscriptionId:subscription.id,statusCode:statusCodeOf(result.error)})
  }
  if(delivered>0)await admin.from('user_notifications').update({push_sent_at:new Date().toISOString()}).eq('id',payload.record.id)
  return Response.json({delivered})
})
