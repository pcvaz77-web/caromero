import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {bodyText,componentsFor,supported} from './template.ts'
import type {Campaign,Template} from './template.ts'
import {whatsappTransport} from '../_shared/platform-whatsapp-transport.ts'

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
const cors = (request:Request) => {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    ...(allowedOrigins().includes(origin) ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin'} : {})
  }
}
const reply = (request:Request, value:Record<string,unknown>, status=200) =>
  Response.json(value,{status,headers:{...cors(request),'Cache-Control':'no-store'}})

type Recipient = {userId:string,phone:string}

function metaConfig() {
  const transport = whatsappTransport(name=>Deno.env.get(name))
  const wabaId = Deno.env.get('META_WHATSAPP_WABA_ID') ?? ''
  const phoneId = Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID') ?? ''
  if (!transport || !/^\d+$/.test(wabaId) || !/^\d+$/.test(phoneId)) return null
  return {...transport,wabaId,phoneId}
}
async function metaTemplates(config:NonNullable<ReturnType<typeof metaConfig>>):Promise<Template[]> {
  const url = `${config.baseUrl}/${config.wabaId}/message_templates?fields=name,language,category,status,components&limit=100`
  const response = await fetch(url,{headers:{Authorization:`Bearer ${config.token}`}})
  const body = await response.json().catch(()=>null)
  if (!response.ok || !Array.isArray(body?.data)) throw new Error('meta_templates_unavailable')
  return body.data.filter((item:any) => item.status === 'APPROVED')
}
async function audience(admin:any,campaign:Campaign):Promise<Recipient[]> {
  const rows:any[] = []
  for (let offset=0;offset<10000;offset+=1000) {
    const {data,error} = await admin.from('school_members').select('school_id,user_id,role,status')
      .eq('status','active').range(offset,offset+999)
    if (error) throw new Error('members_lookup_failed')
    rows.push(...(data||[]))
    if ((data||[]).length<1000) break
    if (offset===9000) throw new Error('audience_too_large')
  }
  const relevant = rows.filter(row=>campaign.target_roles.includes(row.role) &&
    (!campaign.target_school_id || campaign.target_school_id===row.school_id))
  const schoolIds = [...new Set(relevant.map(row=>row.school_id))]
  if (!schoolIds.length) return []
  const {data:schools,error:schoolsError} = await admin.from('schools').select('id,status').in('id',schoolIds)
  if (schoolsError) throw new Error('schools_lookup_failed')
  const activeSchools = new Set((schools||[]).filter(s=>s.status==='active').map(s=>s.id))
  const userIds = [...new Set(relevant.filter(row=>activeSchools.has(row.school_id)).map(row=>row.user_id))]
  const recipients:Recipient[] = []
  for (let offset=0;offset<userIds.length;offset+=200) {
    const ids = userIds.slice(offset,offset+200)
    const [prefs,access] = await Promise.all([
      admin.from('platform_communication_preferences').select('user_id,whatsapp_e164,whatsapp_updates').in('user_id',ids),
      admin.from('platform_account_access').select('user_id,status').in('user_id',ids)
    ])
    if (prefs.error || access.error) throw new Error('preferences_lookup_failed')
    const active = new Set((access.data||[]).filter((item:any)=>item.status==='active').map((item:any)=>item.user_id))
    for (const pref of prefs.data||[]) if (active.has(pref.user_id) && pref.whatsapp_updates===true && /^\+[1-9]\d{7,14}$/.test(pref.whatsapp_e164||''))
      recipients.push({userId:pref.user_id,phone:pref.whatsapp_e164})
  }
  return recipients
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return reply(request,{ok:false,code:'origin_forbidden'},403)
  if (request.method==='OPTIONS') return new Response('ok',{headers:cors(request)})
  if (request.method!=='POST') return reply(request,{ok:false,code:'method_not_allowed'},405)
  if (Number(request.headers.get('content-length')||0)>2048) return reply(request,{ok:false,code:'payload_too_large'},413)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !anon || !service) return reply(request,{ok:false,code:'not_configured'},503)
  const caller = createClient(url,anon,{global:{headers:{Authorization:request.headers.get('Authorization')??''}}})
  const [{data:{user}},{data:isOwner,error:ownerError}] = await Promise.all([
    caller.auth.getUser(),caller.rpc('is_platform_owner')
  ])
  if (!user || ownerError || isOwner!==true) return reply(request,{ok:false,code:'owner_required'},403)
  const body = await request.json().catch(()=>null)
  if (!body || !['templates','preview','send'].includes(body.action)) return reply(request,{ok:false,code:'invalid_request'},400)
  const config = metaConfig()
  if (!config) return reply(request,{ok:false,code:'meta_not_connected'},503)
  let templates:Template[]
  try { templates=(await metaTemplates(config)).filter(supported) }
  catch { return reply(request,{ok:false,code:'meta_templates_unavailable'},502) }
  if (body.action==='templates') return reply(request,{ok:true,templates:templates.map(t=>({
    name:t.name,language:t.language,category:t.category,body:bodyText(t),
    imageRequired:t.components.some(c=>c.type==='HEADER'),
    buttons:t.components.find(c=>c.type==='BUTTONS')?.buttons ?? []
  }))})
  if (typeof body.campaignId!=='string' || typeof body.templateName!=='string' || typeof body.language!=='string')
    return reply(request,{ok:false,code:'invalid_request'},400)
  if (body.buttonLinks != null && (typeof body.buttonLinks!=='object' || Array.isArray(body.buttonLinks) ||
    Object.keys(body.buttonLinks).length>5 || Object.values(body.buttonLinks).some(value=>typeof value!=='string' || value.length>500)))
    return reply(request,{ok:false,code:'invalid_button_links'},400)
  const admin = createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:campaign,error:campaignError}=await admin.from('platform_communication_campaigns')
    .select('*').eq('id',body.campaignId).maybeSingle()
  if (campaignError || !campaign) return reply(request,{ok:false,code:'campaign_not_found'},404)
  const template=templates.find(t=>t.name===body.templateName && t.language===body.language)
  if (!template) return reply(request,{ok:false,code:'template_not_approved'},409)
  let components:any[],recipients:Recipient[]
  try {
    components=componentsFor(template,campaign as Campaign,body.buttonLinks||{})
    recipients=await audience(admin,campaign as Campaign)
  } catch(error) { return reply(request,{ok:false,code:String((error as Error).message)},400) }
  const {data:run}=await admin.from('platform_communication_whatsapp_runs')
    .select('id').eq('campaign_id',campaign.id).maybeSingle()
  if (run) return reply(request,{ok:false,code:'campaign_already_sent_to_whatsapp'},409)
  if (body.action==='preview') return reply(request,{ok:true,eligible:recipients.length,
    category:template.category,templateBody:bodyText(template),components})
  if (!recipients.length) return reply(request,{ok:false,code:'no_opted_in_recipients'},400)
  if (recipients.length>100) return reply(request,{ok:false,code:'audience_limit_100'},400)
  const {data:reservation,error:reserveError}=await admin.from('platform_communication_whatsapp_runs')
    .insert({campaign_id:campaign.id,template_name:template.name,template_language:template.language,
      template_category:template.category,template_components:components,audience_count:recipients.length})
    .select('id').single()
  if (reserveError || !reservation) return reply(request,{ok:false,code:'campaign_already_started'},409)
  let submitted=0,failed=0,skipped=0
  for (const recipient of recipients) {
    const {data:slot,error:slotError}=await admin.from('platform_communication_deliveries')
      .insert({campaign_id:campaign.id,user_id:recipient.userId,channel:'whatsapp',status:'queued'})
      .select('id').single()
    if (slotError || !slot) { failed++; continue }
    const {data:current}=await admin.from('platform_communication_preferences')
      .select('whatsapp_e164,whatsapp_updates').eq('user_id',recipient.userId).maybeSingle()
    if (!current?.whatsapp_updates || current.whatsapp_e164!==recipient.phone) {
      skipped++
      await admin.from('platform_communication_deliveries').update({status:'skipped',error_code:'opted_out'})
        .eq('id',slot.id)
      continue
    }
    try {
      const response=await fetch(`${config.baseUrl}/${config.phoneId}/messages`,{
        method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},
        body:JSON.stringify({messaging_product:'whatsapp',to:recipient.phone.replace('+',''),type:'template',
          template:{name:template.name,language:{code:template.language},components}})
      })
      const result=await response.json().catch(()=>null)
      if (!response.ok || !result?.messages?.[0]?.id) {
        failed++
        await admin.from('platform_communication_deliveries').update({status:'failed',
          error_code:`meta_http_${response.status}`}).eq('id',slot.id)
        continue
      }
      submitted++
      await admin.from('platform_communication_deliveries').update({status:'submitted',
        provider_message_id:String(result.messages[0].id)}).eq('id',slot.id)
    } catch {
      failed++
      // A Meta pode ter aceitado uma resposta incerta. Não há reenvio automático.
      await admin.from('platform_communication_deliveries').update({status:'failed',
        error_code:'provider_response_unknown'}).eq('id',slot.id)
    }
  }
  await admin.from('platform_communication_whatsapp_runs').update({
    status:failed?'failed':'submitted',submitted_count:submitted,failed_count:failed,
    finished_at:new Date().toISOString()
  }).eq('id',reservation.id)
  return reply(request,{ok:true,submitted,failed,skipped})
})
