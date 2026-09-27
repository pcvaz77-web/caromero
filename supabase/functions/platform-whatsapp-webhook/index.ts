import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {decideAction,linkMessage,menuMessage,selectedAction,textMessage,validSettings} from './bot.ts'
import {validOverrideKey} from './auth.ts'
import {whatsappTransport} from '../_shared/platform-whatsapp-transport.ts'

function plain(text:string,status=200) {
  return new Response(text,{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}})
}
async function signed(request:Request,raw:ArrayBuffer,secret:string) {
  const header=request.headers.get('x-hub-signature-256') ?? ''
  if (!/^sha256=[a-f0-9]{64}$/i.test(header)) return false
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['verify'])
  const hex=header.slice(7)
  const signature=Uint8Array.from(hex.match(/../g)!.map(byte=>parseInt(byte,16)))
  return crypto.subtle.verify('HMAC',key,signature,raw)
}

Deno.serve(async request => {
  const verifyToken=Deno.env.get('META_WHATSAPP_VERIFY_TOKEN') ?? ''
  const appSecret=Deno.env.get('META_WHATSAPP_APP_SECRET') ?? ''
  const overrideKey=Deno.env.get('WHATSAPP_WEBHOOK_URL_SECRET') ?? ''
  const wabaId=Deno.env.get('META_WHATSAPP_WABA_ID') ?? ''
  const phoneId=Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID') ?? ''
  const transport=whatsappTransport(name=>Deno.env.get(name))
  if (!verifyToken || !wabaId || !phoneId ||
    (transport?.provider==='dualhook' ? overrideKey.length<32 : !appSecret)) return plain('not configured',503)
  if (transport?.provider==='dualhook' && !validOverrideKey(request.url,overrideKey)) return plain('forbidden',403)
  if (request.method==='GET') {
    const url=new URL(request.url)
    if (url.searchParams.get('hub.mode')==='subscribe' &&
      url.searchParams.get('hub.verify_token')===verifyToken &&
      url.searchParams.get('hub.challenge')) return plain(url.searchParams.get('hub.challenge')!)
    return plain('forbidden',403)
  }
  if (request.method!=='POST') return plain('method not allowed',405)
  if (Number(request.headers.get('content-length')||0)>262144) return plain('payload too large',413)
  const raw=await request.arrayBuffer()
  if (raw.byteLength>262144 ||
    (transport?.provider!=='dualhook' && !await signed(request,raw,appSecret))) return plain('forbidden',403)
  let payload:any
  try { payload=JSON.parse(new TextDecoder().decode(raw)) }
  catch { return plain('invalid json',400) }
  if (payload?.object!=='whatsapp_business_account') return plain('ok')
  const url=Deno.env.get('SUPABASE_URL') ?? ''
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !service) return plain('not configured',503)
  const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:settings,error:settingsError}=await admin.from('platform_whatsapp_bot_settings')
    .select('*').eq('id',true).maybeSingle()
  if (settingsError) return plain('retry',500)
  const botReady=validSettings(settings) && !!transport
  for (const entry of payload.entry||[]) {
    if (String(entry.id)!==wabaId) continue
    for (const change of entry.changes||[]) {
      if (change.field!=='messages' || String(change.value?.metadata?.phone_number_id)!==phoneId) continue
      for (const item of change.value.statuses||[]) {
        const id=String(item.id||'')
        if (!id) continue
        const next=item.status==='delivered' || item.status==='read' ? 'delivered'
          : item.status==='failed' ? 'failed' : null
        if (next) {
          const {error}=await admin.from('platform_communication_deliveries')
          .update({status:next,updated_at:new Date().toISOString(),
            ...(next==='failed'?{error_code:'meta_delivery_failed'}:{})})
          .eq('channel','whatsapp').eq('provider_message_id',id)
          .in('status',['queued','submitted'])
          if (error) return plain('retry',500)
        }
      }
      for (const item of change.value.messages||[]) {
        const action=selectedAction(item)
        const digits=String(item.from||'').replace(/\D/g,'')
        if (!/^[1-9]\d{7,14}$/.test(digits)) continue
        const sender=`+${digits}`
        if (action==='optout') {
          const {error}=await admin.from('platform_communication_preferences')
            .update({whatsapp_updates:false}).eq('whatsapp_e164',sender)
          if (error) return plain('retry',500)
        }
        if (!botReady) continue
        const messageId=String(item.id||'')
        if (!messageId || messageId.length>300) continue
        const now=Date.now()
        const {data:session,error:sessionError}=await admin.from('platform_whatsapp_bot_contacts')
          .select('last_menu_at,handoff_until').eq('sender_e164',sender).maybeSingle()
        if (sessionError) return plain('retry',500)
        const decision=decideAction(item,session,now)
        const {error:eventError}=await admin.from('platform_whatsapp_bot_events')
          .insert({message_id:messageId,sender_e164:sender,action:decision})
        if (eventError?.code==='23505') continue // Mesmo webhook entregue novamente pela Meta.
        if (eventError) return plain('retry',500)
        if (decision==='ignored') {
          await admin.from('platform_whatsapp_bot_events').update({status:'skipped'}).eq('message_id',messageId)
          continue
        }
        const outgoing=decision==='menu'?menuMessage(settings,digits)
          :decision==='link1'||decision==='link2'?linkMessage(settings,digits,decision)
          :decision==='attendant'?textMessage(digits,'Certo! Um atendente vai responder você por aqui. Escreva sua dúvida nesta conversa.')
          :textMessage(digits,'Você não receberá novas campanhas pelo WhatsApp. Se precisar de ajuda, escreva sua dúvida nesta conversa.')
        let result:any=null,code='provider_response_unknown'
        try {
          const response=await fetch(`${transport!.baseUrl}/${phoneId}/messages`,{
            method:'POST',headers:{Authorization:`Bearer ${transport!.token}`,'Content-Type':'application/json'},
            body:JSON.stringify(outgoing)
          })
          result=await response.json().catch(()=>null)
          if (!response.ok || !result?.messages?.[0]?.id) code=`meta_http_${response.status}`
          else code=''
        } catch { /* Resposta incerta: registrar falha, sem reenvio automático. */ }
        const {error:logError}=await admin.from('platform_whatsapp_bot_events').update({
          status:code?'failed':'sent',error_code:code||null,
          provider_response_id:code?null:String(result.messages[0].id)
        }).eq('message_id',messageId)
        if (logError) return plain('retry',500)
        if (code) continue
        if (decision==='menu') {
          const {error}=await admin.from('platform_whatsapp_bot_contacts').upsert({
            sender_e164:sender,last_menu_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()
          },{onConflict:'sender_e164'})
          if (error) return plain('retry',500)
        }
        if (decision==='attendant') {
          const {error}=await admin.from('platform_whatsapp_bot_contacts').upsert({
            sender_e164:sender,handoff_until:new Date(now+24*60*60*1000).toISOString(),updated_at:new Date(now).toISOString()
          },{onConflict:'sender_e164'})
          if (error) return plain('retry',500)
        }
      }
    }
  }
  return plain('ok')
})
