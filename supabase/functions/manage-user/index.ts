import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map(value => value.trim()).filter(Boolean)

const corsHeadersFor = (request: Request) => {
  const origin = request.headers.get('Origin') ?? ''
  return allowedOrigins().includes(origin)
    ? { ...baseCorsHeaders, 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
    : baseCorsHeaders
}

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeadersFor(request), 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request, { error: 'Origem não autorizada.' }, 403)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(request) })
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authorization = request.headers.get('Authorization') ?? ''

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return json(request, { error: 'Sessão inválida.' }, 401)

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: callerIsOwner, error: ownerCheckError } = await callerClient.rpc('is_platform_owner')
  if (ownerCheckError || callerIsOwner !== true) {
    return json(request, { error: 'Somente o proprietário da plataforma pode executar esta ação.' }, 403)
  }

  let action: unknown
  let userId: unknown
  let email: unknown
  try {
    ({ action, userId, email } = await request.json())
  } catch {
    return json(request, { error: 'Corpo da solicitação inválido.' }, 400)
  }
  if (action === 'lookup_user') {
    if (typeof email !== 'string' || !email.trim()) return json(request, { error: 'E-mail inválido.' }, 400)
    const normalizedEmail = email.trim().toLowerCase()
    let targetAuth: User | undefined
    for (let page = 1; page <= 50 && !targetAuth; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) return json(request, { error: 'Não foi possível consultar as contas.' }, 500)
      targetAuth = data.users.find(user => user.email?.trim().toLowerCase() === normalizedEmail)
      if (data.users.length < 200) break
    }
    if (!targetAuth?.email) return json(request, { error: 'Usuário não encontrado.' }, 404)

    const [{ data: profile, error: profileError }, { count: membershipCount, error: membershipError }, { data: access, error: accessError }, { data: owner, error: ownerError }] = await Promise.all([
      admin.from('profiles').select('email,full_name').eq('id', targetAuth.id).maybeSingle(),
      admin.from('school_members').select('id', { count:'exact', head:true }).eq('user_id', targetAuth.id),
      admin.from('platform_account_access').select('status').eq('user_id', targetAuth.id).maybeSingle(),
      admin.from('platform_admins').select('user_id').eq('user_id', targetAuth.id).eq('role', 'owner').limit(1).maybeSingle(),
    ])
    if (profileError || membershipError || accessError || ownerError) {
      return json(request, { error: 'Não foi possível consultar os dados da conta.' }, 500)
    }
    return json(request, {
      user: {
        id: targetAuth.id,
        email: targetAuth.email,
        full_name: profile?.full_name ?? null,
        confirmed: Boolean(targetAuth.email_confirmed_at),
        memberships: membershipCount ?? 0,
        status: access?.status === 'suspended' ? 'suspended' : 'active',
        is_owner: Boolean(owner),
      }
    })
  }
  if (typeof action !== 'string' || !['cancel_login', 'permanent_delete'].includes(action) || typeof userId !== 'string') {
    return json(request, { error: 'Ação inválida.' }, 400)
  }
  if (userId === caller.id) return json(request, { error: 'Você não pode remover a própria conta.' }, 400)

  const { data: targetOwner, error: targetOwnerError } = await admin
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()
  if (targetOwnerError) return json(request, { error: 'Não foi possível validar a conta de destino.' }, 500)
  if (targetOwner) return json(request, { error: 'O proprietário da plataforma não pode ser removido.' }, 400)

  const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(userId)
  if (targetAuthError || !targetAuth?.user?.email) {
    return json(request, { error: 'Usuário não encontrado.' }, 404)
  }
  const { data: targetProfile, error: targetProfileError } = await admin
    .from('profiles').select('email,full_name').eq('id', userId).maybeSingle()
  if (targetProfileError) {
    return json(request, { error: 'Não foi possível consultar a conta de destino.' }, 500)
  }
  const targetEmail = targetAuth.user.email
  const targetName = targetProfile?.full_name
    ?? (typeof targetAuth.user.user_metadata?.full_name === 'string'
      ? targetAuth.user.user_metadata.full_name
      : null)

  const { data: previousAccess, error: previousAccessError } = await admin
    .from('platform_account_access')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()
  if (previousAccessError) return json(request, { error: 'Não foi possível consultar o estado da conta.' }, 500)
  const previousStatus = previousAccess?.status === 'suspended' ? 'suspended' : 'active'

  // Fotos são registros da escola, não da conta que fez o envio. Os caminhos
  // existentes permanecem intactos e continuam autorizados pela referência
  // do aluno nas policies comerciais de storage. Não mover arquivos aqui
  // evita alterações parciais caso a exclusão do Auth seja rejeitada.

  // Só então suspende para encerrar o acesso enquanto o Auth é removido.
  const { error: suspendError } = await admin.from('platform_account_access')
    .upsert({ user_id:userId, status:'suspended', updated_at:new Date().toISOString() }, { onConflict:'user_id' })
  if (suspendError) return json(request, { error: 'Não foi possível suspender a conta antes da exclusão.' }, 500)
  const restorePreviousAccess = async () => {
    if (!previousAccess) {
      await admin.from('platform_account_access').delete().eq('user_id', userId)
      return
    }
    await admin.from('platform_account_access').upsert({
      user_id:userId,
      status:previousStatus,
      updated_at:new Date().toISOString(),
    }, { onConflict:'user_id' })
  }

  let archiveRollback: null | (() => Promise<void>) = null
  if (action === 'cancel_login') {
    const { data: existingArchive, error: archiveLookupError } = await admin.from('cancelled_logins')
      .select('id,email,full_name,cancelled_by,cancelled_at')
      .eq('former_user_id', userId).limit(1).maybeSingle()
    if (archiveLookupError) {
      await restorePreviousAccess()
      return json(request, { error: 'Não foi possível verificar o registro de cancelamento.' }, 500)
    }
    const archiveRow = {
      former_user_id:userId,
      email:targetEmail,
      full_name:targetName,
      cancelled_by:caller.id,
      cancelled_at:new Date().toISOString(),
    }
    const { data: savedArchive, error: archiveError } = existingArchive
      ? await admin.from('cancelled_logins').update(archiveRow).eq('id', existingArchive.id).select('id').single()
      : await admin.from('cancelled_logins').insert(archiveRow).select('id').single()
    if (archiveError) {
      await restorePreviousAccess()
      return json(request, { error: 'Não foi possível registrar o cancelamento.' }, 500)
    }
    archiveRollback = existingArchive
      ? async () => {
          await admin.from('cancelled_logins').update({
            email:existingArchive.email,
            full_name:existingArchive.full_name,
            cancelled_by:existingArchive.cancelled_by,
            cancelled_at:existingArchive.cancelled_at,
          }).eq('id', existingArchive.id)
        }
      : async () => {
          if (savedArchive?.id) await admin.from('cancelled_logins').delete().eq('id', savedArchive.id)
        }
  }

  const auditEvent = action === 'cancel_login'
    ? 'account_login_cancelled'
    : 'account_permanently_deleted'
  const { data: auditRow, error: auditError } = await admin.from('platform_audit_log').insert({
    actor_user_id: caller.id,
    event_type: auditEvent,
    target_user_id: userId,
    previous_state: { status: previousStatus, target_email: targetEmail },
    new_state: { status: action === 'cancel_login' ? 'cancelled' : 'deleted', target_email: targetEmail },
  }).select('id').single()
  if (auditError || !auditRow?.id) {
    if (archiveRollback) await archiveRollback()
    await restorePreviousAccess()
    return json(request, { error: 'Não foi possível registrar a ação administrativa.' }, 500)
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) {
    await admin.from('platform_audit_log').delete().eq('id', auditRow.id)
    if (archiveRollback) await archiveRollback()
    await restorePreviousAccess()
    return json(request, { error: deleteError.message }, 400)
  }

  // Na exclusão permanente, limpa o histórico somente depois que o Auth foi
  // efetivamente removido. Uma falha aqui não pode transformar uma exclusão já
  // concluída em uma resposta falsa de fracasso que incentive nova tentativa.
  if (action === 'permanent_delete') {
    await admin.from('cancelled_logins').delete().eq('former_user_id', userId)
  }

  // Protege instalações antigas que não possuem exclusão em cascata.
  await admin.from('user_permissions').delete().eq('user_id', userId)
  await admin.from('profiles').delete().eq('id', userId)
  return json(request, { ok: true })
})
