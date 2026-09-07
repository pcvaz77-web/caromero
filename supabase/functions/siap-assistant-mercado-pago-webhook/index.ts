import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const encoder = new TextEncoder()
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('')
const safeEqual = (a:string, b:string) => a.length === b.length && [...a].reduce((n, c, i) => n | (c.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0
async function validSignature(request:Request, dataId:string) {
  const secret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET') ?? ''
  const requestId = request.headers.get('x-request-id') ?? ''
  const parts = Object.fromEntries((request.headers.get('x-signature') ?? '').split(',').map(v => v.trim().split('=', 2)))
  if (!secret || !requestId || !parts.ts || !parts.v1 || !dataId) return false
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
  return safeEqual(hex(await crypto.subtle.sign('HMAC', key, encoder.encode(manifest))), parts.v1)
}
async function mercadoPago(path:string, token:string) {
  const response = await fetch(`https://api.mercadopago.com${path}`, { headers:{ Authorization:`Bearer ${token}` } })
  if (!response.ok) throw new Error(`Mercado Pago HTTP ${response.status}`)
  return response.json()
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status:405 })
  const token = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN') ?? ''
  if (!token) return new Response('Not configured', { status:503 })
  let payload:Record<string,any>
  try { payload = await request.json() } catch { return new Response('Invalid body', { status:400 }) }
  const requestUrl = new URL(request.url)
  const dataId = String(requestUrl.searchParams.get('data.id') ?? payload?.data?.id ?? '')
  if (!await validSignature(request, dataId)) return new Response('Invalid signature', { status:401 })
  const eventType = String(payload.type ?? requestUrl.searchParams.get('type') ?? '')
  const eventId = String(payload.id ?? request.headers.get('x-request-id') ?? '')
  if (!eventType || !eventId || !dataId) return new Response('Invalid notification', { status:400 })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth:{ autoRefreshToken:false, persistSession:false } })
  const eventKey = { provider_event_id:eventId, event_type:eventType, resource_id:dataId }
  const { data:known } = await admin.from('siap_assistant_payment_events').select('id,processed').match(eventKey).maybeSingle()
  if (known?.processed) return new Response('ok')
  let eventRowId = known?.id
  if (!eventRowId) {
    const { data, error } = await admin.from('siap_assistant_payment_events').insert({ ...eventKey, signature_valid:true, payload }).select('id').single()
    if (error || !data) return new Response('Could not register event', { status:500 })
    eventRowId = data.id
  }

  try {
    if (eventType === 'subscription_preapproval') {
      const provider = await mercadoPago(`/preapproval/${encodeURIComponent(dataId)}`, token)
      const status = provider.status === 'authorized' ? 'authorized' : provider.status === 'paused' ? 'paused' : ['cancelled','canceled'].includes(provider.status) ? 'cancelled' : 'pending'
      await admin.from('siap_assistant_payment_subscriptions').update({
        status, provider_status:String(provider.status ?? ''), last_webhook_at:new Date().toISOString(), updated_at:new Date().toISOString()
      }).eq('provider_subscription_id', String(provider.id))
    } else if (eventType === 'subscription_authorized_payment') {
      const invoice = await mercadoPago(`/authorized_payments/${encodeURIComponent(dataId)}`, token)
      const { data:payment } = await admin.from('siap_assistant_payment_subscriptions').select('*')
        .eq('provider_subscription_id', String(invoice.preapproval_id ?? '')).maybeSingle()
      if (payment) {
        const approved = invoice?.payment?.status === 'approved'
        const valid = approved
          && String(invoice.external_reference ?? '') === String(payment.external_reference)
          && Number(invoice.transaction_amount) === Number(payment.amount)
          && String(invoice.currency_id) === payment.currency
        await admin.from('siap_assistant_payment_subscriptions').update({
          last_invoice_id:String(invoice.id), last_payment_id:String(invoice?.payment?.id ?? ''),
          last_payment_status:String(invoice?.payment?.status ?? ''), last_webhook_at:new Date().toISOString(), updated_at:new Date().toISOString()
        }).eq('id', payment.id)
        if (valid) {
          const { error } = await admin.rpc('siap_activate_paid_subscription', { p_payment_subscription_id:payment.id, p_paid_at:new Date().toISOString() })
          if (error) throw error
        }
      }
    }
    await admin.from('siap_assistant_payment_events').update({ processed:true, processed_at:new Date().toISOString(), processing_error:null }).eq('id', eventRowId)
    return new Response('ok')
  } catch (error) {
    await admin.from('siap_assistant_payment_events').update({
      processing_error:error instanceof Error ? error.message.slice(0, 1000) : 'Erro desconhecido'
    }).eq('id', eventRowId)
    return new Response('Processing failed', { status:500 })
  }
})
