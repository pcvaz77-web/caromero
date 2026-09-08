import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const baseCorsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const extensionOrigins = [
  'chrome-extension://fgpjjlikinpcjpmmjehbgbfonnbfibnc',
  'chrome-extension://mohcmojnkjjkphgjaogcbokjmnijmggl',
  'chrome-extension://iobkgohpoeoimlhlgdeiojlghbhcijli',
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
  active?: boolean
  status?: 'trial' | 'subscribed' | 'free' | 'expired' | 'suspended'
  mode?: 'carometro' | 'subscription' | 'external'
  freeUses?: Record<string, number> | null
  trialStartedAt?: string
  trialEndsAt?: string
  accessEndsAt?: string
  daysRemaining?: number
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
        items: { type: 'string', minLength: 50, maxLength: 900 },
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
  const openAiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  if (!supabaseUrl || !anonKey) {
    console.error('generate-siap-ai-draft: configuração ausente')
    return json(request, { ok: false, code: 'server_not_configured' }, 503)
  }

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user } } = await callerClient.auth.getUser()
  if (!user) return json(request, { ok: false, code: 'unauthorized' }, 401)

  const { data: licenseData, error: licenseError } = await callerClient.rpc('get_siap_assistant_access_status')
  if (licenseError) {
    console.error('generate-siap-ai-draft: falha ao validar licença', licenseError.code)
    return json(request, { ok: false, code: 'license_check_failed' }, 500)
  }
  const license = (licenseData ?? {}) as LicenseStatus

  let rawBody: unknown
  try { rawBody = await request.json() } catch { return json(request, { ok: false, code: 'invalid_payload' }, 400) }
  if (rawBody && typeof rawBody === 'object' && (rawBody as Record<string, unknown>).action === 'license_status') {
    return json(request, { ok: true, license })
  }
  if (rawBody && typeof rawBody === 'object' && (rawBody as Record<string, unknown>).action === 'consume_feature') {
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
        : 'Você redige textos pedagógicos individualizados e concisos em português brasileiro. Não use o nome do campo como título dentro do texto. Não diagnostique, não invente fatos, não inclua nome, matrícula ou identificadores. Respeite exatamente a finalidade de cada campo. Entregue textos claros, inclusivos e revisáveis pelo professor.',
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

  const { data:usage, error:usageError } = await callerClient.rpc('consume_siap_assistant_feature', {
    p_feature_key:featureKey,
  })
  if (usageError) return json(request, { ok: false, code: 'usage_check_failed' }, 500)
  if (usage?.allowed !== true) return json(request, { ok: false, code: 'free_limit_reached', license:usage?.access ?? license }, 402)

  return json(request, { ok: true, fields, license:usage?.access ?? license, usage })
})
