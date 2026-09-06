import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean)

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

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fields: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'string', minLength: 80, maxLength: 2600 },
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

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request, { ok: false, code: 'forbidden_origin' }, 403)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(request) })
  if (request.method !== 'POST') return json(request, { ok: false, code: 'method_not_allowed' }, 405)

  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json(request, { ok: false, code: 'unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!supabaseUrl || !anonKey || !serviceKey || !openAiKey) {
    console.error('generate-siap-ai-draft: configuração ausente')
    return json(request, { ok: false, code: 'server_not_configured' }, 503)
  }

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user } } = await callerClient.auth.getUser()
  if (!user) return json(request, { ok: false, code: 'unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: memberships, error: membershipError } = await admin
    .from('school_members')
    .select('id, role, school_member_permissions(can_use_siap_assistant)')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (membershipError) {
    console.error('generate-siap-ai-draft: falha ao validar permissão', membershipError.code)
    return json(request, { ok: false, code: 'permission_check_failed' }, 500)
  }

  const authorized = (memberships ?? []).some((membership: Record<string, unknown>) => {
    if (membership.role === 'school_admin') return true
    const rawPermissions = membership.school_member_permissions
    const permissions = Array.isArray(rawPermissions) ? rawPermissions[0] : rawPermissions
    return !!permissions && typeof permissions === 'object'
      && (permissions as Record<string, unknown>).can_use_siap_assistant === true
  })
  if (!authorized) return json(request, { ok: false, code: 'assistant_not_allowed' }, 403)

  let rawBody: unknown
  try { rawBody = await request.json() } catch { return json(request, { ok: false, code: 'invalid_payload' }, 400) }
  const payload = parsePayload(rawBody)
  if (!payload) return json(request, { ok: false, code: 'invalid_payload' }, 400)

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-terra',
      reasoning: { effort: 'low' },
      store: false,
      instructions: 'Você redige textos pedagógicos em português brasileiro. Não diagnostique, não invente fatos, não inclua nome, matrícula ou identificadores. Respeite exatamente a finalidade de cada campo. Entregue textos específicos, claros, inclusivos e revisáveis pelo professor.',
      input: promptFor(payload),
      text: { format: { type: 'json_schema', name: 'siap_pedagogical_draft', strict: true, schema } },
    }),
  })

  if (!response.ok) {
    console.error('generate-siap-ai-draft: OpenAI indisponível', response.status)
    return json(request, { ok: false, code: 'generation_failed' }, 502)
  }

  const result = await response.json() as Record<string, unknown>
  const outputText = extractOutputText(result)
  let parsed: { fields?: unknown }
  try { parsed = JSON.parse(outputText) } catch { return json(request, { ok: false, code: 'invalid_model_output' }, 502) }
  const fields = cleanList(parsed.fields, 4, 2600)
  if (fields.length !== 4) return json(request, { ok: false, code: 'invalid_model_output' }, 502)

  return json(request, { ok: true, fields })
})
