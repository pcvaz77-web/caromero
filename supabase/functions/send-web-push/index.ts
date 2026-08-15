import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

type NotificationRow = { id:number; recipient_id:string; title:string; body:string; class_id?:string|null }
type WebhookPayload = { type:'INSERT'; table:'user_notifications'; record:NotificationRow }

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed',{status:405})
  if (request.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return new Response('Unauthorized',{status:401})
  const payload = await request.json() as WebhookPayload
  if (payload.type !== 'INSERT' || payload.table !== 'user_notifications') return Response.json({ignored:true})
  const publicKey=Deno.env.get('VAPID_PUBLIC_KEY')!,privateKey=Deno.env.get('VAPID_PRIVATE_KEY')!
  webpush.setVapidDetails('mailto:administrador@carometro.app',publicKey,privateKey)
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const {data:subscriptions,error}=await admin.from('push_subscriptions').select('*').eq('user_id',payload.record.recipient_id).eq('enabled',true)
  if(error) return Response.json({error:error.message},{status:500})
  const message=JSON.stringify({title:payload.record.title,body:payload.record.body,tag:`carometro-${payload.record.id}`,url:`./?notification=${payload.record.id}`})
  let delivered=0
  for(const subscription of subscriptions||[]){
    try{await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth_key}},message);delivered++}
    catch(error){const status=(error as {statusCode?:number}).statusCode;if(status===404||status===410)await admin.from('push_subscriptions').delete().eq('id',subscription.id);else console.error(error)}
  }
  if(delivered>0)await admin.from('user_notifications').update({push_sent_at:new Date().toISOString()}).eq('id',payload.record.id)
  return Response.json({delivered})
})
