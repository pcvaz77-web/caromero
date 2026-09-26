import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const origins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(Boolean)
const cors = (request:Request) => {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    ...(origins().includes(origin) ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin'} : {})
  }
}
const reply = (request:Request, body:Record<string,unknown>, status=200) =>
  Response.json(body,{status,headers:{...cors(request),'Cache-Control':'no-store'}})
const esc = (value:string) => value.replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]!))
type Campaign = {
  id:string, title:string, email_subject:string, message_body:string,
  video_url:string|null, cover_url:string|null, target_roles:string[], target_school_id:string|null,
  status:string
}
type Recipient = {
  userId:string, email:string, name:string, phone:string|null,
  emailUpdates:boolean, whatsappUpdates:boolean, unsubscribeToken:string
}

async function paged(admin:any, table:string, columns:string, query:(q:any)=>any) {
  const rows:any[] = []
  for (let start=0; ; start+=1000) {
    const {data,error} = await query(admin.from(table).select(columns)).range(start,start+999)
    if (error) throw new Error(`${table}_lookup_failed`)
    rows.push(...(data || []))
    if ((data || []).length < 1000) break
    if (start >= 9000) throw new Error('audience_too_large')
  }
  return rows
}
async function audience(admin:any, campaign:Campaign):Promise<{recipients:Recipient[],excluded:number}> {
  const members = await paged(admin,'school_members','school_id,user_id,role,status',
    q => q.eq('status','active'))
  const relevant = members.filter((m:any) =>
    campaign.target_roles.includes(m.role) &&
    (!campaign.target_school_id || campaign.target_school_id === m.school_id))
  const schoolIds = [...new Set(relevant.map((m:any)=>m.school_id))]
  if (!schoolIds.length) return {recipients:[],excluded:0}
  const schools = await paged(admin,'schools','id,status',q => q.in('id',schoolIds))
  const activeSchools = new Set(schools.filter((s:any)=>s.status==='active').map((s:any)=>s.id))
  const userIds = [...new Set(relevant.filter((m:any)=>activeSchools.has(m.school_id)).map((m:any)=>m.user_id))]
  if (!userIds.length) return {recipients:[],excluded:0}
  // PostgREST limita a lista in; lotes também mantêm a consulta previsível.
  const profiles:any[] = [], prefs:any[] = [], access:any[] = []
  for (let i=0;i<userIds.length;i+=200) {
    const ids = userIds.slice(i,i+200)
    const results = await Promise.all([
      admin.from('profiles').select('id,email,full_name').in('id',ids),
      admin.from('platform_communication_preferences')
        .select('user_id,whatsapp_e164,email_updates,whatsapp_updates,unsubscribe_token').in('user_id',ids),
      admin.from('platform_account_access').select('user_id,status').in('user_id',ids)
    ])
    if (results.some(result => result.error)) throw new Error('recipient_lookup_failed')
    profiles.push(...(results[0].data || []))
    prefs.push(...(results[1].data || []))
    access.push(...(results[2].data || []))
  }
  const profileById = new Map(profiles.map(p=>[p.id,p]))
  const prefById = new Map(prefs.map(p=>[p.user_id,p]))
  const activeAccounts = new Set(access.filter(a=>a.status==='active').map(a=>a.user_id))
  const recipients:Recipient[] = []
  for (const userId of userIds) {
    const profile = profileById.get(userId)
    const pref = prefById.get(userId)
    if (!activeAccounts.has(userId) || !profile || !pref) continue
    if (!pref.email_updates && !pref.whatsapp_updates) continue
    recipients.push({
      userId, email:String(profile.email || '').trim().toLowerCase(),
      name:String(profile.full_name || '').trim(),
      phone:pref.whatsapp_e164 || null,
      emailUpdates:pref.email_updates === true && !!profile.email,
      whatsappUpdates:pref.whatsapp_updates === true && !!pref.whatsapp_e164,
      unsubscribeToken:String(pref.unsubscribe_token)
    })
  }
  return {recipients,excluded:userIds.length-recipients.length}
}
function emailHtml(campaign:Campaign, unsubscribeUrl:string) {
  const paragraphs = esc(campaign.message_body).split(/\n{2,}/).map(s=>`<p style="font-size:16px;line-height:1.55;color:#334155">${s.replace(/\n/g,'<br>')}</p>`).join('')
  const cover = campaign.cover_url ? `<img src="${esc(campaign.cover_url)}" alt="" width="600" style="display:block;width:100%;height:auto;border:0">` : ''
  // video_url é o campo persistido na primeira migration e pode apontar
  // para qualquer conteúdo HTTPS da campanha, inclusive páginas e tutoriais.
  const link = campaign.video_url ? `<p style="margin:26px 0"><a href="${esc(campaign.video_url)}" style="display:inline-block;padding:15px 22px;border-radius:9px;background:#4b43d9;color:#fff;text-decoration:none;font-weight:700">Abrir link</a></p>` : ''
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><body style="margin:0;background:#edf2f8;font-family:Arial,sans-serif;color:#17233a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:white;border-radius:16px;overflow:hidden"><tr><td style="background:#17233a;color:white;padding:24px;font-size:20px;font-weight:800">CARÔMETRO</td></tr><tr><td>${cover}</td></tr><tr><td style="padding:26px"><h1 style="font-size:27px;margin:0 0 18px">${esc(campaign.title)}</h1>${paragraphs}${link}<p style="font-size:14px;color:#64748b">Equipe Carômetro</p></td></tr><tr><td style="padding:20px 26px;background:#f4f7fb;font-size:12px;color:#64748b">Você recebeu esta mensagem porque aceitou comunicações por e-mail. <a href="${esc(unsubscribeUrl)}">Parar de receber</a>.</td></tr></table></td></tr></table></body></html>`
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin') ?? ''
  if (!origins().includes(origin)) return reply(request,{ok:false,code:'origin_forbidden'},403)
  if (request.method === 'OPTIONS') return new Response('ok',{headers:cors(request)})
  if (request.method !== 'POST') return reply(request,{ok:false,code:'method_not_allowed'},405)
  if (Number(request.headers.get('content-length') || 0) > 4096) return reply(request,{ok:false,code:'payload_too_large'},413)
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !anonKey || !serviceKey) return reply(request,{ok:false,code:'not_configured'},503)
  const caller = createClient(url,anonKey,{global:{headers:{Authorization:request.headers.get('Authorization') ?? ''}}})
  const [{data:{user}},{data:isOwner,error:ownerError}] = await Promise.all([
    caller.auth.getUser(),caller.rpc('is_platform_owner')
  ])
  if (!user || ownerError || isOwner !== true) return reply(request,{ok:false,code:'owner_required'},403)
  const body = await request.json().catch(()=>null)
  if (!body || !['preview','whatsapp_recipients','optout_whatsapp','send_email'].includes(body.action) || typeof body.campaignId !== 'string')
    return reply(request,{ok:false,code:'invalid_request'},400)
  const admin = createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data:campaign,error:campaignError} = await admin.from('platform_communication_campaigns')
    .select('*').eq('id',body.campaignId).maybeSingle()
  if (campaignError || !campaign) return reply(request,{ok:false,code:'campaign_not_found'},404)
  if (!['whatsapp_recipients','optout_whatsapp'].includes(body.action) && campaign.status !== 'draft')
    return reply(request,{ok:false,code:'campaign_not_draft'},409)
  let recipients:Recipient[], excluded:number
  try { ({recipients,excluded} = await audience(admin,campaign as Campaign)) }
  catch (error) { return reply(request,{ok:false,code:String((error as Error).message)},500) }
  const emailRecipients = recipients.filter(r=>r.emailUpdates)
  const whatsappRecipients = recipients.filter(r=>r.whatsappUpdates)
  if (body.action === 'preview') return reply(request,{
    ok:true,emailEligible:emailRecipients.length,whatsappEligible:whatsappRecipients.length,excluded
  })
  if (body.action === 'whatsapp_recipients') return reply(request,{
    ok:true,total:whatsappRecipients.length,
    recipients:whatsappRecipients.slice(0,100).map(r=>({userId:r.userId,name:r.name,phone:r.phone}))
  })
  if (body.action === 'optout_whatsapp') {
    const target = whatsappRecipients.find(r=>r.userId === body.userId)
    if (!target) return reply(request,{ok:false,code:'recipient_not_eligible'},404)
    const {error:optoutError} = await admin.from('platform_communication_preferences')
      .update({whatsapp_updates:false}).eq('user_id',target.userId)
    return optoutError ? reply(request,{ok:false,code:'optout_failed'},500) : reply(request,{ok:true})
  }
  if (!emailRecipients.length) return reply(request,{ok:false,code:'no_opted_in_recipients'},400)
  if (emailRecipients.length > 100) return reply(request,{ok:false,code:'audience_limit_100'},400)
  const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''
  const senderEmail = Deno.env.get('CAROMETRO_CAMPAIGN_SENDER_EMAIL') ?? ''
  if (!brevoKey || !senderEmail) return reply(request,{ok:false,code:'email_sender_not_configured'},503)
  const {data:reserved,error:reserveError} = await admin.from('platform_communication_campaigns')
    .update({status:'sending',updated_at:new Date().toISOString()})
    .eq('id',campaign.id).eq('status','draft').select('id').maybeSingle()
  if (reserveError || !reserved) return reply(request,{ok:false,code:'campaign_already_started'},409)
  let submitted=0, failed=0
  for (const recipient of emailRecipients) {
    // Nenhuma repetição automática: uma resposta incerta do provedor exige
    // investigação manual antes de qualquer novo envio.
    const {data:slot,error:slotError} = await admin.from('platform_communication_deliveries')
      .insert({campaign_id:campaign.id,user_id:recipient.userId,channel:'email',status:'queued'})
      .select('id').single()
    if (slotError || !slot) { failed++; continue }
    const {data:current} = await admin.from('platform_communication_preferences')
      .select('email_updates,unsubscribe_token').eq('user_id',recipient.userId).maybeSingle()
    if (!current?.email_updates) {
      await admin.from('platform_communication_deliveries').update({status:'skipped',error_code:'opted_out'}).eq('id',slot.id)
      continue
    }
    const {data:authData,error:authError} = await admin.auth.admin.getUserById(recipient.userId)
    const verifiedEmail = authData?.user?.email?.trim().toLowerCase()
    if (authError || !authData?.user?.email_confirmed_at || !verifiedEmail) {
      await admin.from('platform_communication_deliveries')
        .update({status:'skipped',error_code:'email_not_verified',updated_at:new Date().toISOString()}).eq('id',slot.id)
      continue
    }
    const unsubscribeUrl = `${url}/functions/v1/platform-communication-unsubscribe?token=${encodeURIComponent(current.unsubscribe_token)}`
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email',{
        method:'POST',
        headers:{'api-key':brevoKey,'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({
          sender:{name:'Equipe Carômetro',email:senderEmail},
          to:[{email:verifiedEmail,name:recipient.name || undefined}],
          subject:campaign.email_subject,
          htmlContent:emailHtml(campaign as Campaign,unsubscribeUrl)
        })
      })
      const result = await response.json().catch(()=>({}))
      if (!response.ok) {
        failed++
        await admin.from('platform_communication_deliveries')
          .update({status:'failed',error_code:`brevo_http_${response.status}`,updated_at:new Date().toISOString()}).eq('id',slot.id)
        continue
      }
      submitted++
      await admin.from('platform_communication_deliveries')
        .update({status:'submitted',provider_message_id:String(result.messageId || ''),updated_at:new Date().toISOString()}).eq('id',slot.id)
    } catch {
      failed++
      await admin.from('platform_communication_deliveries')
        .update({status:'failed',error_code:'provider_response_unknown',updated_at:new Date().toISOString()}).eq('id',slot.id)
    }
  }
  await admin.from('platform_communication_campaigns').update({
    status:failed ? 'failed' : 'submitted',
    submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq('id',campaign.id)
  return reply(request,{ok:true,submitted,failed})
})
