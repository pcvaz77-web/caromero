import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// Contrato público de resposta: nunca inclui mensagem crua do GoTrue, stack,
// recipient_email, create_user ou qualquer sinal de existência de auth.users.
// "error" (texto em português) é mantido em paralelo a "ok"/"code" só para
// compatibilidade com o frontend hoje publicado (school-invitations.js),
// que lê apenas error.message / data.error — nunca "ok" nem "code".
type PublicResult = { ok: boolean; code?: 'rate_limited' | 'invitation_unavailable' | 'forbidden' | 'server_error'; error?: string; sent?: boolean; already_linked?: boolean; method?: string; retry_after_seconds?: number }

const json = (request: Request, body: PublicResult, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeadersFor(request), 'Content-Type': 'application/json' } })

// Piso conservador quando o Supabase Auth devolve 429 sem um retry-after
// preciso e utilizável na resposta do client (o supabase-js não expõe esse
// valor de forma confiável). Não inventamos precisão que não temos — usamos
// o mesmo piso de 60s já documentado no cooldown de
// claim_school_invitation_resend_slot (Migration 071).
const DEFAULT_RATE_LIMIT_RETRY_SECONDS = 60

type ResendSlot = {
  allowed: boolean
  retry_after_seconds: number | null
  recipient_email: string | null
  create_user: boolean | null
}

// Único ponto que decide e executa o envio, reutilizado pelos dois modos.
// claim_school_invitation_resend_slot é a única fonte de recipient_email e
// create_user — nenhum dos dois é aceito do cliente nem reconstruído aqui.
async function claimAndSend(
  request: Request,
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  anonKey: string,
  origin: string,
  invitationToken: string,
): Promise<Response> {
  const { data, error } = await admin.rpc('claim_school_invitation_resend_slot', { p_token: invitationToken })
  if (error) {
    console.error('claim_school_invitation_resend_slot falhou:', error.message)
    return json(request, { ok: false, code: 'server_error', error: 'Não foi possível concluir a operação. Tente novamente.' }, 500)
  }

  const slot = (Array.isArray(data) ? data[0] : data) as ResendSlot | undefined
  if (!slot || slot.allowed !== true) {
    if (slot?.retry_after_seconds != null) {
      return json(request, {
        ok: false,
        code: 'rate_limited',
        retry_after_seconds: slot.retry_after_seconds,
        error: 'Aguarde antes de solicitar um novo envio.',
      }, 429)
    }
    return json(request, { ok: false, code: 'invitation_unavailable', error: 'Este convite não está mais disponível.' }, 400)
  }

  const recipientEmail = slot.recipient_email as string
  const shouldCreateUser = slot.create_user === true
  const redirectTo = `${origin}/accept-invite.html?token=${invitationToken}`

  const anon = createClient(supabaseUrl, anonKey)
  const { error: otpError } = await anon.auth.signInWithOtp({
    email: recipientEmail,
    options: { shouldCreateUser, emailRedirectTo: redirectTo },
  })
  if (otpError) {
    console.error('signInWithOtp falhou:', otpError.status, otpError.message)
    if (otpError.status === 429) {
      return json(request, {
        ok: false,
        code: 'rate_limited',
        retry_after_seconds: DEFAULT_RATE_LIMIT_RETRY_SECONDS,
        error: 'Aguarde antes de solicitar um novo envio.',
      }, 429)
    }
    return json(request, { ok: false, code: 'server_error', error: 'Não foi possível enviar o e-mail agora. Tente novamente.' }, 500)
  }

  // "method" não distingue conta nova de conta existente nem estado de
  // confirmação — o frontend hoje publicado não lê este campo, e o novo
  // fluxo não deve vazar estado de conta através dele.
  return json(request, { ok: true, sent: true, method: 'auth_email' }, 200)
}

async function handleAdminMode(
  request: Request,
  payload: Record<string, unknown>,
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  anonKey: string,
  origin: string,
): Promise<Response> {
  const invitationId = payload.invitationId
  if (typeof invitationId !== 'string' || !invitationId) {
    return json(request, { ok: false, code: 'invitation_unavailable', error: 'Convite inválido.' }, 400)
  }

  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization) {
    return json(request, { ok: false, code: 'forbidden', error: 'Sessão inválida.' }, 401)
  }
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return json(request, { ok: false, code: 'forbidden', error: 'Sessão inválida.' }, 401)

  // E-mail, papel, escola, token, status e expiração vêm sempre do próprio
  // registro do convite, nunca do que o frontend informar nesta chamada.
  const { data: invitation, error: invitationError } = await admin
    .from('school_invitations')
    .select('id, school_id, email, role, status, expires_at, token')
    .eq('id', invitationId)
    .maybeSingle()
  if (invitationError) return json(request, { ok: false, code: 'server_error', error: 'Não foi possível consultar o convite.' }, 500)
  if (!invitation) return json(request, { ok: false, code: 'invitation_unavailable', error: 'Convite não encontrado.' }, 404)

  const invitationToken = invitation.token as string

  // Esta função nunca envia convite de school_admin, mesmo que a tabela
  // aceite esse valor (o onboarding do administrador principal usa um
  // caminho próprio, com autorização de proprietário).
  if (invitation.role !== 'coordinator' && invitation.role !== 'teacher') {
    return json(request, { ok: false, code: 'forbidden', error: 'Esta função não envia este tipo de convite.' }, 403)
  }
  if (invitation.status !== 'pending') {
    return json(request, { ok: false, code: 'invitation_unavailable', error: 'Este convite não está mais disponível.' }, 400)
  }
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return json(request, { ok: false, code: 'invitation_unavailable', error: 'Este convite expirou.' }, 400)
  }

  // Autorização: replica exatamente as regras de create_school_invitation.
  const { data: callerMember, error: callerMemberError } = await admin
    .from('school_members')
    .select('id, role')
    .eq('school_id', invitation.school_id)
    .eq('user_id', caller.id)
    .eq('status', 'active')
    .maybeSingle()
  if (callerMemberError) return json(request, { ok: false, code: 'server_error', error: 'Não foi possível validar seu acesso a esta escola.' }, 500)
  if (!callerMember) return json(request, { ok: false, code: 'forbidden', error: 'Você não possui acesso ativo a esta escola.' }, 403)

  if (callerMember.role === 'school_admin') {
    // autorizado para coordinator ou teacher, já garantido acima.
  } else if (callerMember.role === 'coordinator') {
    if (invitation.role !== 'teacher') {
      return json(request, { ok: false, code: 'forbidden', error: 'Coordenadores só podem convidar professores.' }, 403)
    }
    const { data: callerPermissions, error: permissionsError } = await admin
      .from('school_member_permissions')
      .select('can_invite_teachers')
      .eq('member_id', callerMember.id)
      .maybeSingle()
    if (permissionsError) return json(request, { ok: false, code: 'server_error', error: 'Não foi possível validar suas permissões.' }, 500)
    if (!callerPermissions?.can_invite_teachers) {
      return json(request, { ok: false, code: 'forbidden', error: 'Você não possui permissão para convidar professores.' }, 403)
    }
  } else {
    return json(request, { ok: false, code: 'forbidden', error: 'Você não possui permissão para enviar convites.' }, 403)
  }

  // already_linked precisa ser resolvido ANTES de consumir o slot de
  // cooldown (claim_school_invitation_resend_slot) — nunca gastamos uma
  // tentativa de envio para um convite cujo destinatário já é membro ativo.
  // is_invitation_recipient_already_linked (Migration 072) resolve isso
  // inteiramente no banco, sem paginação de auth.users: recebe só o id do
  // convite, deriva school_id/e-mail internamente, nunca devolve PII — só
  // true/false. Pequena janela de corrida aceita conscientemente entre esta
  // checagem e claimAndSend logo abaixo: no pior cenário concorrente, o
  // único efeito é um envio redundante — accept_school_invitation continua
  // sendo a guarda autoritativa contra vínculo duplicado.
  const { data: alreadyLinked, error: alreadyLinkedError } = await admin.rpc(
    'is_invitation_recipient_already_linked',
    { p_invitation_id: invitationId },
  )
  if (alreadyLinkedError) return json(request, { ok: false, code: 'server_error', error: 'Não foi possível validar o vínculo existente.' }, 500)
  if (alreadyLinked === true) {
    return json(request, { ok: true, sent: false, already_linked: true }, 200)
  }

  return claimAndSend(request, admin, supabaseUrl, anonKey, origin, invitationToken)
}

async function handleResumeMode(
  request: Request,
  payload: Record<string, unknown>,
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  anonKey: string,
  origin: string,
): Promise<Response> {
  // Nenhuma sessão exigida. Entrada mínima: só o token do convite. Nunca
  // aceita invitationId como substituto, nem qualquer outro campo — a
  // posse do invitationToken é a única autorização deste modo.
  const invitationToken = payload.token
  if (typeof invitationToken !== 'string' || !invitationToken) {
    return json(request, { ok: false, code: 'invitation_unavailable', error: 'Convite inválido.' }, 400)
  }
  return claimAndSend(request, admin, supabaseUrl, anonKey, origin, invitationToken)
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request, { ok: false, code: 'forbidden', error: 'Origem não autorizada.' }, 403)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(request) })
  if (request.method !== 'POST') return json(request, { ok: false, code: 'server_error', error: 'Método não permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(request, { ok: false, code: 'server_error', error: 'Corpo da solicitação inválido.' }, 400)
  }
  if (typeof body !== 'object' || body === null) {
    return json(request, { ok: false, code: 'server_error', error: 'Corpo da solicitação inválido.' }, 400)
  }
  const payload = body as Record<string, unknown>

  // Compatibilidade obrigatória: school-invitations.js hoje publicado envia
  // só { invitationId }, sem "mode". Ausência de mode + invitationId válido
  // é tratada como mode:'admin' — nunca inferida de nenhuma outra forma.
  // Campos sensíveis eventualmente enviados pelo cliente (recipient_email,
  // create_user, school_id, role, user_id) nunca são lidos em nenhum ramo
  // abaixo — nem para o modo admin nem para o resume.
  const rawMode = payload.mode
  const mode = rawMode === undefined && typeof payload.invitationId === 'string' ? 'admin' : rawMode

  if (mode === 'admin') {
    return handleAdminMode(request, payload, admin, supabaseUrl, anonKey, origin)
  }
  if (mode === 'resume') {
    return handleResumeMode(request, payload, admin, supabaseUrl, anonKey, origin)
  }

  // Falha fechada: qualquer payload/mode fora dos dois valores aceitos é
  // rejeitado sem nenhuma tentativa de interpretação adicional.
  return json(request, { ok: false, code: 'server_error', error: 'Solicitação inválida.' }, 400)
})
