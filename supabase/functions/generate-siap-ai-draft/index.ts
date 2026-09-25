import { examAccessForUser } from './exam-access.mjs'
import { examBlockKey } from './exam-block.mjs'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-assistant-session, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const extensionOrigins = [
  'chrome-extension://fgpjjlikinpcjpmmjehbgbfonnbfibnc',
  'chrome-extension://mohcmojnkjjkphgjaogcbokjmnijmggl',
  'chrome-extension://iobkgohpoeoimlhlgdeiojlghbhcijli',
  'chrome-extension://bfbjocbablljmknahhlkjhllpjmihibe',
]

const allowedOrigins = () => [...new Set([
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  ...extensionOrigins,
])]

const corsHeadersFor = (request: Request) => {
  const origin = request.headers.get('Origin') ?? ''
  return allowedOrigins().includes(origin)
    ? { ...baseCorsHeaders, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : baseCorsHeaders
}

type DraftKind = 'pei' | 'planning'
type DraftPayload = {
  kind: DraftKind
  grade: string
  subject: string
  period?: string
  guidance?: string
  educationalContext?: string
  selectedSkills?: string[]
  selectedContents?: string[]
  tense?: 'planned' | 'realized'
}

type LicenseStatus = {
  accountEmail?: string | null
  examAccess?: { active:boolean; expiresAt:string|null; status:string }
  active?: boolean
  status?: 'trial' | 'subscribed' | 'free' | 'expired' | 'suspended' | 'manual' | 'grant_ended' | 'trial_ineligible'
  mode?: 'carometro' | 'subscription' | 'external'
  freeUses?: Record<string, number> | null
  trialStartedAt?: string
  trialEndsAt?: string
  accessEndsAt?: string
  daysRemaining?: number
  permanent?: boolean
}

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(request), 'Content-Type': 'application/json' },
  })

const cleanText = (value: unknown, max: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  : ''

const cleanList = (value: unknown, maxItems: number, maxItemLength: number) => Array.isArray(value)
  ? value.slice(0, maxItems).map((item) => cleanText(item, maxItemLength)).filter(Boolean)
  : []

const parsePayload = (value: unknown): DraftPayload | null => {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (raw.kind !== 'pei' && raw.kind !== 'planning') return null
  const grade = cleanText(raw.grade, 80)
  const subject = cleanText(raw.subject, 160)
  if (!grade || !subject) return null
  return {
    kind: raw.kind,
    grade,
    subject,
    period: cleanText(raw.period, 80),
    guidance: cleanText(raw.guidance, 1200),
    educationalContext: cleanText(raw.educationalContext, 3500),
    selectedSkills: cleanList(raw.selectedSkills, 20, 500),
    selectedContents: cleanList(raw.selectedContents, 20, 500),
    tense: raw.tense === 'realized' ? 'realized' : 'planned',
  }
}

const schemaFor = (kind: DraftKind) => kind === 'planning'
  ? {
    type: 'object',
    additionalProperties: false,
    properties: {
      objectives: { type: 'string', minLength: 10, maxLength: 150 },
      description: { type: 'string', minLength: 15, maxLength: 60 },
      methodology: { type: 'string', minLength: 200 },
      evaluation: { type: 'string', minLength: 160 },
    },
    required: ['objectives', 'description', 'methodology', 'evaluation'],
  }
  : {
    type: 'object',
    additionalProperties: false,
    properties: {
      fields: {
        type: 'array',
        minItems: 4,
        maxItems: 4,
        items: { type: 'string', minLength: 420, maxLength: 900 },
      },
    },
    required: ['fields'],
  }

const promptFor = (payload: DraftPayload) => {
  const labels = payload.kind === 'pei'
    ? [
      'Expectativas de aprendizagem para o estudante',
      'Conteúdos propostos',
      'Estratégias e metodologias',
      'Procedimentos e instrumentos de avaliação',
    ]
    : [
      'Objetivos de conhecimento e conteúdos',
      'Descrição da aula',
      'Metodologia',
      'Avaliação',
    ]

  return JSON.stringify({
    tarefa: payload.kind === 'pei' ? 'Rascunho pedagógico individualizado' : 'Planejamento de aula',
    camposNaOrdem: labels,
    serie: payload.grade,
    componenteCurricular: payload.subject,
    periodo: payload.period,
    tempoVerbal: payload.tense === 'realized' ? 'passado, como registro do que foi realizado' : 'futuro, como planejamento',
    orientacaoDoProfessor: payload.guidance,
    contextoEducacionalAnonimizado: payload.educationalContext,
    habilidadesSelecionadas: payload.selectedSkills,
    conteudosSelecionados: payload.selectedContents,
    requisitosDoPei: payload.kind === 'pei' ? [
      'Produza entre 450 e 700 caracteres em cada um dos quatro campos, com dois ou três períodos completos e articulados.',
      'Inicie cada campo de uma maneira própria: as primeiras palavras e a construção inicial não podem se repetir entre os quatro textos.',
      'Use conceitos, práticas, habilidades e formas de avaliação coerentes com o componente curricular informado; não entregue um texto genérico que serviria igualmente para qualquer disciplina.',
      'Incorpore a orientação do professor no campo ou nos campos a que ela se aplica, sem copiá-la mecanicamente e sem contrariar o contexto educacional anonimizado.',
      'Diferencie rigorosamente as finalidades: expectativas descrevem aprendizagens esperadas; conteúdos delimitam objetos de conhecimento; estratégias explicam mediações e atividades; avaliação define procedimentos, evidências e instrumentos.',
      'Evite sequências repetitivas como iniciar vários campos por Foram, Serão, Será ou O estudante.',
    ] : undefined,
  })
}

const extractOutputText = (data: Record<string, unknown>) => {
  if (typeof data.output_text === 'string') return data.output_text
  const output = Array.isArray(data.output) ? data.output : []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as Array<Record<string, unknown>>
      : []
    for (const part of content) if (typeof part.text === 'string') return part.text
  }
  return ''
}

const sessionTokenHash = async (token: string) => {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

const createSessionToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const accessStatusForUser = async (admin: ReturnType<typeof createClient>, userId: string): Promise<LicenseStatus> => {
  const { data:grant } = await admin.from('siap_assistant_access_grants').select('revoked_at,expires_at').eq('user_id', userId).maybeSingle()
  const carometro = Boolean(grant && !grant.revoked_at && (!grant.expires_at || new Date(grant.expires_at).getTime() > Date.now()))
  const now = new Date()
  if (carometro) {
    const grantEnd = grant?.expires_at ? new Date(grant.expires_at) : null
    return {
      active:true,
      status:'manual',
      mode:'carometro',
      accessEndsAt:grantEnd?.toISOString(),
      daysRemaining:grantEnd ? Math.max(0, Math.ceil((grantEnd.getTime() - now.getTime()) / 86400000)) : undefined,
      freeUses:null,
    }
  }
  const { data:license } = await admin.from('siap_assistant_licenses').select('*').eq('user_id', userId).maybeSingle()
  if (license) {
    const trialEnd = new Date(license.trial_ends_at).getTime()
    const paidEnd = license.paid_until ? new Date(license.paid_until).getTime() : 0
    const effectiveEnd = Math.max(trialEnd, paidEnd)
    const active = !license.suspended_at && effectiveEnd > now.getTime()
    if (active && paidEnd > 0) return {
      active,
      status: license.suspended_at ? 'suspended' : active && paidEnd >= trialEnd ? 'subscribed' : active ? 'trial' : 'expired',
      mode:'subscription',
      trialStartedAt: license.trial_started_at,
      trialEndsAt: license.trial_ends_at,
      accessEndsAt: new Date(effectiveEnd).toISOString(),
      daysRemaining: Math.max(0, Math.ceil((effectiveEnd - now.getTime()) / 86400000)),
      freeUses: null,
    }
    if (paidEnd > 0 && paidEnd <= now.getTime()) return {
      active:false,
      status:'expired',
      mode:'subscription',
      accessEndsAt:license.paid_until,
      daysRemaining:0,
      freeUses:null,
    }
  }
  if (grant) {
    return {
      active:false,
      status:'grant_ended',
      mode:'external',
      accessEndsAt:grant.expires_at ?? undefined,
      daysRemaining:0,
      freeUses:{ planning:0, content:0, attendance:0, pei:0 },
    }
  }
  const { data:account } = await admin.auth.admin.getUserById(userId)
  const email = account?.user?.email?.trim().toLowerCase()
  if (email) {
    const { data:history } = await admin.from('siap_assistant_email_eligibility')
      .select('trial_user_id,had_grant,had_paid').eq('email', email).maybeSingle()
    if (history && (history.had_grant || history.had_paid || (history.trial_user_id && history.trial_user_id !== userId))) {
      return { active:false, status:'trial_ineligible', mode:'external', daysRemaining:0,
        freeUses:{ planning:0, content:0, attendance:0, pei:0 } }
    }
  }
  const { data:usage } = await admin.from('siap_assistant_free_usage').select('feature_key,used_count').eq('user_id', userId)
  const used = Object.fromEntries((usage ?? []).map((item) => [item.feature_key, Number(item.used_count || 0)]))
  const freeUses = { planning:2-(used.planning || 0), content:2-(used.content || 0), attendance:2-(used.attendance || 0), pei:2-(used.pei || 0) }
  return { active:Object.values(freeUses).some((remaining) => remaining > 0), status:'free', mode:'external', daysRemaining:undefined, freeUses }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request, { ok: false, code: 'forbidden_origin' }, 403)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(request) })
  if (request.method !== 'POST') return json(request, { ok: false, code: 'method_not_allowed' }, 405)

  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json(request, { ok: false, code: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('generate-siap-ai-draft: configuração ausente')
    return json(request, { ok: false, code: 'server_not_configured' }, 503)
  }

  let rawBody: unknown
  try { rawBody = await request.json() } catch { return json(request, { ok: false, code: 'invalid_payload' }, 400) }
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth:{ autoRefreshToken:false, persistSession:false } })
  if (rawBody && typeof rawBody === 'object' && (rawBody as Record<string,unknown>).action === 'email_device_session') {
    return json(request,{ok:false,code:'email_verification_required'},403);
  }
  const deviceToken = cleanText(request.headers.get('X-Assistant-Session'), 200)
  let userId = ''
  let license: LicenseStatus
  if (deviceToken) {
    const tokenHash = await sessionTokenHash(deviceToken)
    const { data:deviceSession } = await admin.from('siap_assistant_device_sessions').select('id,user_id,expires_at,revoked_at').eq('token_hash', tokenHash).maybeSingle()
    if (!deviceSession || deviceSession.revoked_at || new Date(deviceSession.expires_at).getTime() <= Date.now()) return json(request, { ok:false, code:'device_session_expired' }, 401)
    if (rawBody && typeof rawBody === 'object' && (rawBody as Record<string,unknown>).action === 'revoke_device_session') {
      const { error } = await admin.from('siap_assistant_device_sessions').update({ revoked_at:new Date().toISOString() }).eq('id', deviceSession.id)
      return error ? json(request, { ok:false, code:'device_session_revoke_failed' }, 503) : json(request, { ok:true })
    }
    userId = deviceSession.user_id
    license = await accessStatusForUser(admin, userId)
    if (license.mode === 'external') license = {...license, active:false, freeUses:null}
    await admin.from('siap_assistant_device_sessions').update({ last_used_at:new Date().toISOString(), expires_at:new Date(Date.now() + 30 * 86400000).toISOString() }).eq('id', deviceSession.id)
  } else {
    const { data: { user } } = await callerClient.auth.getUser()
    if (!user) return json(request, { ok: false, code: 'unauthorized' }, 401)
    userId = user.id
    const { data: licenseData, error: licenseError } = await callerClient.rpc('get_siap_assistant_access_status')
    if (licenseError) {
      console.error('generate-siap-ai-draft: falha ao validar licença', licenseError.code)
      return json(request, { ok: false, code: 'license_check_failed' }, 500)
    }
    license = (licenseData ?? {}) as LicenseStatus
  }
  const accessAction = rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>).action : '';
  if (['exam_preview','exam_bind','exam_check','exam_finish'].includes(String(accessAction))) {
    if(accessAction!=='exam_finish') {
      const access=await examAccessForUser(admin,userId);
      if(access.active && ['granted','subscription'].includes(access.status)) return json(request,{ok:true,license:{examAccess:access}});
    }
    let block;
    try { block=examBlockKey((rawBody as Record<string,unknown>).block); }
    catch { return json(request,{ok:false,code:'invalid_exam_block'},400); }
    const {data,error}=await admin.rpc('siap_exam_commerce_access',{p_user:userId,p_block:block,p_operation:String(accessAction).slice(5)});
    if(error) return json(request,{ok:false,code:'exam_access_failed'},503);
    return json(request,{ok:true,license:{examAccess:data}});
  }
  // Device sessions use a separate resolver; include the paid bundle there too.
  if (deviceToken) {
    const commerce=await examAccessForUser(admin,userId);
    if (commerce.generalUntil && Date.parse(commerce.generalUntil)>Date.now() && !(license.active && ['subscription','carometro'].includes(license.mode||''))) {
      license={...license,active:true,mode:'subscription',status:'subscribed',freeUses:null,accessEndsAt:commerce.generalUntil};
    }
  }
  if (['license_status','create_device_session'].includes(String(accessAction))) {
    const {data:account,error:accountError}=await admin.auth.admin.getUserById(userId);
    if(accountError) return json(request,{ok:false,code:'account_check_failed'},503);
    license.accountEmail=account?.user?.email?.trim().toLowerCase() || null;
    license.examAccess = await examAccessForUser(admin, userId);
  }
  if (rawBody && typeof rawBody === 'object' && (rawBody as Record<string, unknown>).action === 'create_device_session') {
    if (deviceToken) return json(request, { ok:false, code:'user_session_required' }, 400)
    if (license.examAccess?.active !== true && (license.active !== true || !['carometro','subscription'].includes(license.mode ?? ''))) return json(request, { ok:false, code:'persistent_session_not_allowed', license }, 402)
    const token = createSessionToken()
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
    const { error } = await admin.from('siap_assistant_device_sessions').insert({ user_id:userId, token_hash:await sessionTokenHash(token), expires_at:expiresAt })
    if (error) return json(request, { ok:false, code:'device_session_create_failed' }, 500)
    return json(request, { ok:true, deviceToken:token, expiresAt, license })
  }
  if (rawBody && typeof rawBody === 'object' && (rawBody as Record<string, unknown>).action === 'license_status') {
    return json(request, { ok: true, license, deviceExpiresAt:deviceToken ? new Date(Date.now() + 30 * 86400000).toISOString() : undefined })
  }
  if (rawBody && typeof rawBody === 'object' && (rawBody as Record<string, unknown>).action === 'consume_feature') {
    if (deviceToken) return json(request, { ok:false, code:'device_action_not_supported' }, 400)
    const feature = cleanText((rawBody as Record<string, unknown>).feature, 20)
    if (!['planning','content','attendance','pei'].includes(feature)) return json(request, { ok:false, code:'invalid_feature' }, 400)
    const { data:usage, error:usageError } = await callerClient.rpc('consume_siap_assistant_feature', { p_feature_key:feature })
    if (usageError) return json(request, { ok:false, code:'usage_check_failed' }, 500)
    return usage?.allowed === true
      ? json(request, { ok:true, usage, license:usage.access ?? license })
      : json(request, { ok:false, code:'free_limit_reached', usage, license:usage?.access ?? license }, 402)
  }
  if (license.active !== true) {
    return json(request, { ok: false, code: 'license_expired', license }, 402)
  }
  if (!openAiKey) {
    console.error('generate-siap-ai-draft: OPENAI_API_KEY ausente')
    return json(request, { ok: false, code: 'server_not_configured' }, 503)
  }

  const payload = parsePayload(rawBody)
  if (!payload) return json(request, { ok: false, code: 'invalid_payload' }, 400)
  const featureKey = payload.kind === 'pei' ? 'pei' : 'planning'
  if (license.mode === 'external' && Number(license.freeUses?.[featureKey] ?? 0) <= 0) {
    return json(request, { ok:false, code:'free_limit_reached', license }, 402)
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-luna',
      reasoning: { effort: 'low' },
      store: false,
      instructions: payload.kind === 'planning'
        ? 'Você redige planejamentos pedagógicos diretos em português brasileiro. Use aproximadamente 30 caracteres em description, 300 em methodology e 250 em evaluation, podendo variar o necessário para concluir as frases naturalmente dentro dos limites do formato. A metodologia deve explicar de forma prática como a aula será realizada. Não use títulos dentro dos textos, não repita informações, não diagnostique e não invente fatos. Não inclua nome, matrícula ou identificadores.'
        : 'Você redige textos pedagógicos individualizados, consistentes e bem desenvolvidos em português brasileiro. Cada campo deve ter de 450 a 700 caracteres, sem ultrapassar 900, e começar com palavras e estruturas diferentes das usadas nos demais campos. Leia obrigatoriamente o componente curricular, a série, o período, a orientação do professor e o contexto educacional fornecidos. Empregue vocabulário, objetos de conhecimento, práticas e instrumentos próprios da disciplina indicada, evitando generalidades intercambiáveis entre Matemática, Língua Portuguesa, Educação Física, Química ou qualquer outro componente. Integre a orientação do professor de forma natural e pertinente. Não use o nome do campo como título dentro do texto, não diagnostique, não invente fatos e não inclua nome, matrícula ou identificadores. Respeite rigorosamente a finalidade específica de cada campo e entregue textos inclusivos, coesos e revisáveis pelo professor.',
      input: promptFor(payload),
      text: { format: { type: 'json_schema', name: 'siap_pedagogical_draft', strict: true, schema: schemaFor(payload.kind) } },
    }),
  })

  if (!response.ok) {
    console.error('generate-siap-ai-draft: OpenAI indisponível', response.status)
    return json(request, { ok: false, code: 'generation_failed' }, 502)
  }

  const result = await response.json() as Record<string, unknown>
  const outputText = extractOutputText(result)
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(outputText) } catch { return json(request, { ok: false, code: 'invalid_model_output' }, 502) }
  const fields = payload.kind === 'planning'
    ? [
      cleanText(parsed.objectives, 150),
      cleanText(parsed.description, 60),
      cleanText(parsed.methodology, 1200),
      cleanText(parsed.evaluation, 800),
    ].filter(Boolean)
    : cleanList(parsed.fields, 4, 900)
  if (fields.length !== 4) return json(request, { ok: false, code: 'invalid_model_output' }, 502)

  const { data:usage, error:usageError } = deviceToken
    ? { data:{ allowed:true, unlimited:true, remaining:null, access:license }, error:null }
    : await callerClient.rpc('consume_siap_assistant_feature', { p_feature_key:featureKey })
  if (usageError) return json(request, { ok: false, code: 'usage_check_failed' }, 500)
  if (usage?.allowed !== true) return json(request, { ok: false, code: 'free_limit_reached', license:usage?.access ?? license }, 402)

  return json(request, { ok: true, fields, license:usage?.access ?? license, usage, deviceExpiresAt:deviceToken ? new Date(Date.now() + 30 * 86400000).toISOString() : undefined })
})
