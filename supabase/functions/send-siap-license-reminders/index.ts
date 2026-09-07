import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const REMINDER_DAYS = new Set([7, 3, 1, 0])
const esc = (value:string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!))

async function sendEmail(apiKey:string, senderEmail:string, to:string, subject:string, htmlContent:string) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:'POST',
    headers:{ 'api-key':apiKey, 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify({ sender:{ name:'Equipe do Assistente SIAP', email:senderEmail }, to:[{ email:to }], subject, htmlContent }),
  })
  const result = await response.json().catch(() => ({}))
  return { response, result }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status:405 })
  const expectedSecret = Deno.env.get('SIAP_REMINDER_CRON_SECRET') ?? ''
  if (!expectedSecret || request.headers.get('x-cron-secret') !== expectedSecret) return new Response('Unauthorized', { status:401 })
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''
  const senderEmail = Deno.env.get('SIAP_SUPPORT_EMAIL') ?? 'assistentesiap@sistemacarometro.com.br'
  const testEmail = Deno.env.get('SIAP_REMINDER_TEST_EMAIL') ?? ''
  const publicUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://sistemacarometro.com.br').replace(/\/$/, '')
  if (!supabaseUrl || !serviceKey || !brevoKey) return new Response('Not configured', { status:503 })

  const requestBody = await request.json().catch(() => ({}))
  if (requestBody?.test === true) {
    if (!testEmail) return Response.json({ ok:false, code:'test_email_not_configured' }, { status:503 })
    const subject = 'Teste dos lembretes do Assistente SIAP'
    const { response, result } = await sendEmail(
      brevoKey,
      senderEmail,
      testEmail,
      subject,
      `<h2>${subject}</h2><p>O envio automático de avisos de licença está configurado e operacional.</p><p>Equipe do Assistente SIAP</p>`,
    )
    if (!response.ok) return Response.json({ ok:false, code:'test_email_failed', providerStatus:response.status }, { status:502 })
    return Response.json({ ok:true, test:true, providerMessageId:String(result.messageId ?? '') })
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth:{ autoRefreshToken:false, persistSession:false } })
  const now = Date.now()
  const horizon = new Date(now + 8 * 86400000).toISOString()
  const { data:licenses, error } = await admin.from('siap_assistant_licenses')
    .select('user_id,trial_ends_at,paid_until,suspended_at').is('suspended_at', null)
    .or(`trial_ends_at.lte.${horizon},paid_until.lte.${horizon}`)
  if (error) {
    console.error('send-siap-license-reminders: license lookup failed', error.code, error.message)
    return Response.json({ ok:false, code:'license_lookup_failed', databaseCode:error.code ?? null }, { status:500 })
  }

  let sent = 0
  let skipped = 0
  let failed = 0
  for (const license of licenses ?? []) {
    const accessEndsAt = [license.trial_ends_at, license.paid_until].filter(Boolean)
      .map(value => new Date(value).getTime()).reduce((max, value) => Math.max(max, value), 0)
    const days = Math.max(0, Math.ceil((accessEndsAt - now) / 86400000))
    if (!REMINDER_DAYS.has(days) || accessEndsAt < now - 86400000) { skipped += 1; continue }

    const { data:slot, error:slotError } = await admin.from('siap_assistant_reminder_deliveries').insert({
      user_id:license.user_id, reminder_day:days, channel:'email', access_ends_at:new Date(accessEndsAt).toISOString()
    }).select('id').maybeSingle()
    if (slotError?.code === '23505') { skipped += 1; continue }
    if (slotError || !slot) { failed += 1; continue }

    const { data:{ user } } = await admin.auth.admin.getUserById(license.user_id)
    if (!user?.email) {
      await admin.from('siap_assistant_reminder_deliveries').update({ status:'failed', processing_error:'E-mail da conta indisponível.' }).eq('id', slot.id)
      failed += 1
      continue
    }
    const subject = days === 0 ? 'Seu acesso ao Assistente SIAP termina hoje' : `Seu acesso ao Assistente SIAP termina em ${days} dia${days === 1 ? '' : 's'}`
    const { response, result } = await sendEmail(
      brevoKey,
      senderEmail,
      user.email,
      subject,
      `<h2>${esc(subject)}</h2><p>Para continuar usando planejamento e PEI com IA sem interrupção, escolha seu plano.</p><p><a href="${publicUrl}/assistente-siap.html#planos">Ver planos do Assistente SIAP</a></p><p>Equipe do Assistente SIAP</p>`,
    )
    if (!response.ok) {
      await admin.from('siap_assistant_reminder_deliveries').update({ status:'failed', processing_error:`Brevo HTTP ${response.status}` }).eq('id', slot.id)
      failed += 1
      continue
    }
    await admin.from('siap_assistant_reminder_deliveries').update({
      status:'sent', provider_message_id:String(result.messageId ?? ''), sent_at:new Date().toISOString()
    }).eq('id', slot.id)
    sent += 1
  }
  return Response.json({ ok:true, sent, skipped, failed })
})
