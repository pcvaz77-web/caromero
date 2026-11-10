import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const esc = (value:string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!))

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status:405 })
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const senderEmail = Deno.env.get('SIAP_SUPPORT_EMAIL') ?? ''
  if (!serviceKey || !brevoKey || !supabaseUrl || !senderEmail) return new Response('Not configured', { status:503 })
  // O gateway valida a assinatura do JWT; apenas o papel de serviço pode disparar este envio.
  const bearer = request.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  let role = ''
  try { role = JSON.parse(atob(bearer.split('.')[1] ?? '')).role ?? '' } catch { /* JWT inválido */ }
  if (role !== 'service_role') return new Response('Unauthorized', { status:401 })
  const body = await request.json().catch(() => ({}))
  const paymentId = String(body?.paymentSubscriptionId ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId)) {
    return Response.json({ ok:false, code:'invalid_payment_id' }, { status:400 })
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth:{ autoRefreshToken:false, persistSession:false } })
  const { data:payment, error:paymentError } = await admin.from('siap_assistant_payment_subscriptions')
    .select('id,user_id,payer_email,status,last_payment_status,provider').eq('id',paymentId).maybeSingle()
  if (paymentError) return Response.json({ ok:false, code:'payment_lookup_failed' }, { status:500 })
  if (!payment || payment.provider !== 'mercado_pago' || payment.status !== 'authorized' || payment.last_payment_status !== 'approved') {
    return Response.json({ ok:false, code:'payment_not_approved' }, { status:409 })
  }
  const { data:license, error:licenseError } = await admin.from('siap_assistant_licenses')
    .select('paid_until,suspended_at').eq('user_id',payment.user_id).maybeSingle()
  if (licenseError) return Response.json({ ok:false, code:'license_lookup_failed' }, { status:500 })
  if (!license?.paid_until || Date.parse(license.paid_until) <= Date.now() || license.suspended_at) {
    return Response.json({ ok:false, code:'license_not_active' }, { status:409 })
  }

  const { data:claimed, error:claimError } = await admin.rpc('siap_claim_install_email', { p_payment_subscription_id:paymentId })
  if (claimError) return Response.json({ ok:false, code:'delivery_claim_failed' }, { status:500 })
  if (!claimed) return Response.json({ ok:true, sent:false, code:'already_sent_or_sending' })

  const publicUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://sistemacarometro.com.br').replace(/\/$/, '')
  const accountUrl = `${publicUrl}/assistente-siap-conta.html?plano=account`
  const subject = 'Pagamento aprovado — instale o Assistente SIAP'
  const htmlContent = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#17324a;line-height:1.5">
    <p style="font-size:14px;color:#08734f;font-weight:700">ASSISTENTE SIAP · ACESSO LIBERADO</p>
    <h1 style="font-size:27px;line-height:1.2;color:#075c3c;margin:10px 0">Pagamento aprovado! Próximo passo: instale o Assistente SIAP.</h1>
    <p>Sua licença está ativa para a conta <strong>${esc(payment.payer_email)}</strong>.</p>
    <p style="font-size:14px;color:#536179">Clique no botão para abrir sua conta. Na página, instale a extensão e conecte-a em duas etapas.</p>
    <p style="margin:26px 0"><a href="${accountUrl}" style="display:inline-block;padding:15px 22px;border-radius:10px;background:#08734f;color:#fff;text-decoration:none;font-size:18px;font-weight:800">Instalar e conectar o Assistente</a></p>
    <p style="font-size:13px;color:#667085">Se o botão não abrir, acesse <a href="${accountUrl}">${accountUrl}</a> com o mesmo e-mail da compra.</p>
    <p style="font-size:13px;color:#667085">Equipe do Assistente SIAP</p>
  </div>`
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:'POST',
      headers:{ 'api-key':brevoKey, 'Content-Type':'application/json', Accept:'application/json' },
      body:JSON.stringify({
        sender:{ name:'Equipe do Assistente SIAP', email:senderEmail },
        to:[{ email:payment.payer_email }], subject, htmlContent,
      }),
    })
    if (!response.ok) throw new Error(`Brevo HTTP ${response.status}`)
    const result = await response.json().catch(() => ({}))
    const { error:updateError } = await admin.from('siap_assistant_install_email_deliveries').update({
      status:'sent', sent_at:new Date().toISOString(), provider_message_id:String(result.messageId ?? ''), processing_error:null,
    }).eq('payment_subscription_id',paymentId)
    if (updateError) throw new Error('delivery_record_failed')
    return Response.json({ ok:true, sent:true })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'send_failed'
    await admin.from('siap_assistant_install_email_deliveries').update({ status:'failed', processing_error:reason.slice(0,200) })
      .eq('payment_subscription_id',paymentId).eq('status','sending')
    console.error('send-siap-install-email:', reason)
    return Response.json({ ok:false, code:'email_send_failed' }, { status:502 })
  }
})
