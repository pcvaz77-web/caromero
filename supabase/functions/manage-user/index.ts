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
  let invitationId: unknown
  try {
    ({ action, userId, email, invitationId } = await request.json())
  } catch {
    return json(request, { error: 'Corpo da solicitação inválido.' }, 400)
  }
  if (action === 'invite_school_admin') {
    if (typeof invitationId !== 'string' || !invitationId) {
      return json(request, { error: 'Convite inválido.' }, 400)
    }

    // O e-mail e o token usados no envio vêm sempre do próprio registro do
    // convite, nunca do que o frontend informar nesta chamada.
    const { data: invitation, error: invitationError } = await admin
      .from('school_invitations')
      .select('id, school_id, email, role, status, expires_at, token')
      .eq('id', invitationId)
      .maybeSingle()
    if (invitationError) return json(request, { error: 'Não foi possível consultar o convite.' }, 500)
    if (!invitation) return json(request, { error: 'Convite não encontrado.' }, 404)
    if (invitation.role !== 'school_admin') {
      return json(request, { error: 'Este convite não é de administrador principal.' }, 400)
    }
    if (invitation.status !== 'pending') {
      return json(request, { error: 'Este convite não está mais disponível.' }, 400)
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      return json(request, { error: 'Este convite expirou.' }, 400)
    }

    const { data: school, error: schoolError } = await admin
      .from('schools')
      .select('id, name')
      .eq('id', invitation.school_id)
      .maybeSingle()
    if (schoolError) return json(request, { error: 'Não foi possível consultar a escola.' }, 500)
    if (!school) return json(request, { error: 'Escola não encontrada.' }, 404)

    const invitedEmail = invitation.email
    const redirectTo = `${origin}/accept-invite.html?token=${invitation.token}`

    let targetAuth: User | undefined
    for (let page = 1; page <= 50 && !targetAuth; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) return json(request, { error: 'Não foi possível consultar as contas.' }, 500)
      targetAuth = data.users.find(user => user.email?.trim().toLowerCase() === invitedEmail)
      if (data.users.length < 200) break
    }

    if (targetAuth) {
      const { count: alreadyMember, error: memberCheckError } = await admin
        .from('school_members')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', invitation.school_id)
        .eq('user_id', targetAuth.id)
      if (memberCheckError) return json(request, { error: 'Não foi possível validar o vínculo existente.' }, 500)
      if ((alreadyMember ?? 0) > 0) {
        return json(request, { sent: false, already_linked: true })
      }
    }

    if (!targetAuth) {
      // Conta inexistente: cria e envia pelo mecanismo nativo do Supabase,
      // usando o SMTP/Brevo já configurado.
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(invitedEmail, { redirectTo })
      if (inviteError) return json(request, { error: inviteError.message }, 500)
      return json(request, { sent: true, method: 'invite' })
    }

    // Conta já existe — confirmada ou não, convite ainda pendente. Nunca
    // apaga nem recria a conta: reenvia por link mágico, que autentica ao
    // ser clicado e, se a conta ainda não estava confirmada, confirma o
    // e-mail nesse mesmo clique. Não altera senha nem nenhum dado existente.
    const anon = createClient(url, anonKey)
    const { error: otpError } = await anon.auth.signInWithOtp({
      email: invitedEmail,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    })
    if (otpError) {
      return json(request, { error: `Não foi possível reenviar automaticamente: ${otpError.message}` }, 500)
    }
    return json(request, {
      sent: true,
      method: targetAuth.email_confirmed_at ? 'magiclink' : 'magiclink_confirm',
    })
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
