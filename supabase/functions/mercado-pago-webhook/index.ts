import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

const encoder = new TextEncoder()
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('')
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}
async function validSignature(request: Request, dataId: string) {
  const secret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET') ?? ''
  const requestId = request.headers.get('x-request-id') ?? ''
  const signature = request.headers.get('x-signature') ?? ''
  const parts = Object.fromEntries(signature.split(',').map(item => item.trim().split('=', 2)))
  if (!secret || !requestId || !parts.ts || !parts.v1 || !dataId) return false
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
  const calculated = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(manifest)))
  return safeEqual(calculated, parts.v1)
}

const api = async (path: string, accessToken: string) => {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' }
  })
  if (!response.ok) throw new Error(`Mercado Pago respondeu HTTP ${response.status}.`)
  return response.json()
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status:405 })
  const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')
  if (!accessToken) return new Response('Not configured', { status:503 })

  let payload: Record<string, any>
  try { payload = await request.json() } catch { return new Response('Invalid body', { status:400 }) }
  const url = new URL(request.url)
  const dataId = String(url.searchParams.get('data.id') ?? payload?.data?.id ?? '')
  if (!await validSignature(request, dataId)) return new Response('Invalid signature', { status:401 })

  const eventType = String(payload.type ?? url.searchParams.get('type') ?? '')
  const eventId = String(payload.id ?? request.headers.get('x-request-id') ?? '')
  if (!eventType || !eventId || !dataId) return new Response('Invalid notification', { status:400 })

  const urlSupabase = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(urlSupabase, serviceKey, { auth:{ autoRefreshToken:false, persistSession:false } })
  const eventKey = { provider:'mercado_pago', provider_event_id:eventId, event_type:eventType, resource_id:dataId }
  const { data:known } = await admin.from('platform_payment_events').select('id, processed').match(eventKey).maybeSingle()
  if (known?.processed) return new Response('ok', { status:200 })
  let eventRowId = known?.id
  if (!eventRowId) {
    const { data:eventRow, error:eventError } = await admin.from('platform_payment_events').insert({
      ...eventKey, action:String(payload.action ?? ''), signature_valid:true, payload
    }).select('id').single()
    if (eventError || !eventRow) return new Response('Could not register event', { status:500 })
    eventRowId = eventRow.id
  }

  try {
    let paymentRow: any = null
    let activation: any = null
    if (eventType === 'subscription_preapproval') {
      const subscription = await api(`/preapproval/${encodeURIComponent(dataId)}`, accessToken)
      const { data } = await admin.from('platform_payment_subscriptions').select('*')
        .eq('provider_subscription_id', String(subscription.id)).maybeSingle()
      paymentRow = data
      if (paymentRow) {
        const providerStatus = String(subscription.status ?? '')
        const localStatus = providerStatus === 'authorized' ? 'authorized'
          : providerStatus === 'paused' ? 'paused'
          : providerStatus === 'cancelled' || providerStatus === 'canceled' ? 'cancelled' : 'pending'
        await admin.from('platform_payment_subscriptions').update({
          provider_status:providerStatus, status:localStatus, last_webhook_at:new Date().toISOString(), updated_at:new Date().toISOString()
        }).eq('id', paymentRow.id)
        if (localStatus === 'paused' || localStatus === 'cancelled') {
          const { error } = await admin.rpc('platform_sync_paid_subscription_access', {
            p_payment_subscription_id:paymentRow.id, p_access_active:false
          })
          if (error) throw error
        }
      }
    } else if (eventType === 'subscription_authorized_payment') {
      const invoice = await api(`/authorized_payments/${encodeURIComponent(dataId)}`, accessToken)
      const { data } = await admin.from('platform_payment_subscriptions').select('*')
        .eq('provider_subscription_id', String(invoice.preapproval_id ?? '')).maybeSingle()
      paymentRow = data
      if (paymentRow) {
        const approved = invoice?.payment?.status === 'approved'
        const sameReference = String(invoice.external_reference ?? '') === String(paymentRow.external_reference)
        const sameAmount = Number(invoice.transaction_amount) === Number(paymentRow.amount)
        const sameCurrency = String(invoice.currency_id) === paymentRow.currency
        await admin.from('platform_payment_subscriptions').update({
          status:approved && sameReference && sameAmount && sameCurrency ? 'authorized' : paymentRow.status,
          provider_status:String(invoice.status ?? paymentRow.provider_status ?? ''),
          last_invoice_id:String(invoice.id), last_payment_id:String(invoice?.payment?.id ?? ''),
          last_payment_status:String(invoice?.payment?.status ?? ''), last_webhook_at:new Date().toISOString(),
          updated_at:new Date().toISOString()
        }).eq('id', paymentRow.id)
        if (approved && sameReference && sameAmount && sameCurrency) {
          const { data:activated, error:activationError } = await admin.rpc('platform_activate_paid_subscription', {
            p_payment_subscription_id:paymentRow.id
          })
          if (activationError) throw activationError
          activation = activated
          if (activation?.invitation_id) await sendAdministratorInvite(admin, activation.invitation_id)
          const { error:accessError } = await admin.rpc('platform_sync_paid_subscription_access', {
            p_payment_subscription_id:paymentRow.id, p_access_active:true
          })
          if (accessError) throw accessError
        }
      }
    }

    await admin.from('platform_payment_events').update({
      processed:true, processed_at:new Date().toISOString(), processing_error:null
    }).eq('id', eventRowId)
    return new Response('ok', { status:200 })
  } catch (error) {
    await admin.from('platform_payment_events').update({
      processed:false, processing_error:error instanceof Error ? error.message.slice(0, 1000) : 'Erro desconhecido'
    }).eq('id', eventRowId)
    return new Response('Processing failed', { status:500 })
  }
})

async function sendAdministratorInvite(admin: any, invitationId: string) {
  const { data:invitation, error } = await admin.from('school_invitations')
    .select('email, token, status, expires_at').eq('id', invitationId).single()
  if (error || !invitation || invitation.status !== 'pending') throw new Error('Convite administrativo indisponível.')
  const site = (Deno.env.get('PUBLIC_SITE_URL') ?? '').replace(/\/$/, '')
  if (!site) throw new Error('PUBLIC_SITE_URL não configurada.')
  const redirectTo = `${site}/accept-invite.html?token=${invitation.token}`

  let target: User | undefined
  for (let page = 1; page <= 50 && !target; page += 1) {
    const { data, error:listError } = await admin.auth.admin.listUsers({ page, perPage:200 })
    if (listError) throw listError
    target = data.users.find((user: User) => user.email?.trim().toLowerCase() === invitation.email)
    if (data.users.length < 200) break
  }
  if (!target) {
    const { error:inviteError } = await admin.auth.admin.inviteUserByEmail(invitation.email, { redirectTo })
    if (inviteError) throw inviteError
    return
  }
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { error:otpError } = await anon.auth.signInWithOtp({
    email:invitation.email, options:{ emailRedirectTo:redirectTo, shouldCreateUser:false }
  })
  if (otpError) throw otpError
}
