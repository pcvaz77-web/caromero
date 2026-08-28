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

  let invitationId: unknown
  try {
    ({ invitationId } = await request.json())
  } catch {
    return json(request, { error: 'Corpo da solicitação inválido.' }, 400)
  }
  if (typeof invitationId !== 'string' || !invitationId) {
    return json(request, { error: 'Convite inválido.' }, 400)
  }

  // E-mail, papel, escola, token, status e expiração vêm sempre do próprio
  // registro do convite, nunca do que o frontend informar nesta chamada.
  const { data: invitation, error: invitationError } = await admin
    .from('school_invitations')
    .select('id, school_id, email, role, status, expires_at, token')
    .eq('id', invitationId)
    .maybeSingle()
  if (invitationError) return json(request, { error: 'Não foi possível consultar o convite.' }, 500)
  if (!invitation) return json(request, { error: 'Convite não encontrado.' }, 404)

  // Esta função nunca envia convite de school_admin, mesmo que a tabela
  // aceite esse valor (o onboarding do administrador principal usa um
  // caminho próprio, com autorização de proprietário).
  if (invitation.role !== 'coordinator' && invitation.role !== 'teacher') {
    return json(request, { error: 'Esta função não envia este tipo de convite.' }, 403)
  }
  if (invitation.status !== 'pending') {
    return json(request, { error: 'Este convite não está mais disponível.' }, 400)
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return json(request, { error: 'Este convite expirou.' }, 400)
  }

  // Autorização: replica exatamente as regras de create_school_invitation.
  const { data: callerMember, error: callerMemberError } = await admin
    .from('school_members')
    .select('id, role')
    .eq('school_id', invitation.school_id)
    .eq('user_id', caller.id)
    .eq('status', 'active')
    .maybeSingle()
  if (callerMemberError) return json(request, { error: 'Não foi possível validar seu acesso a esta escola.' }, 500)
  if (!callerMember) return json(request, { error: 'Você não possui acesso ativo a esta escola.' }, 403)

  if (callerMember.role === 'school_admin') {
    // autorizado para coordinator ou teacher, já garantido acima.
  } else if (callerMember.role === 'coordinator') {
    if (invitation.role !== 'teacher') {
      return json(request, { error: 'Coordenadores só podem convidar professores.' }, 403)
    }
    const { data: callerPermissions, error: permissionsError } = await admin
      .from('school_member_permissions')
      .select('can_invite_teachers')
      .eq('member_id', callerMember.id)
      .maybeSingle()
    if (permissionsError) return json(request, { error: 'Não foi possível validar suas permissões.' }, 500)
    if (!callerPermissions?.can_invite_teachers) {
      return json(request, { error: 'Você não possui permissão para convidar professores.' }, 403)
    }
  } else {
    return json(request, { error: 'Você não possui permissão para enviar convites.' }, 403)
  }

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
      .eq('status', 'active')
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
})
