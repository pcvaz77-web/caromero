import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Orquestrador da exclusão permanente de uma escola arquivada (Fase 2 do
// Painel da Plataforma). Nunca chamado para escola active/suspended — a
// própria RPC platform_begin_school_deletion rejeita isso de forma
// independente.
//
// Defesa em profundidade, por desenho:
//   - callerClient (JWT de quem chamou) é usado para autorização E para
//     TODA chamada às RPCs que escrevem dado de negócio
//     (platform_begin_school_deletion, platform_update_school_deletion_job,
//     platform_purge_school_data) — dentro delas, auth.uid() continua
//     sendo o proprietário real, e cada uma roda seu próprio
//     is_platform_owner() de novo, sem depender de nenhum parâmetro de
//     identidade vindo desta function.
//   - admin (service_role) é usado SOMENTE para Storage: a RLS de
//     storage.objects já exige is_active_school_member(school_id), e uma
//     escola arquivada tem is_school_active()=false para qualquer pessoa,
//     inclusive o proprietário — só o service_role consegue limpar os
//     objetos de uma escola arquivada.
//   - o prefixo do Storage é sempre `${schoolId}/`, onde schoolId vem do
//     job já validado pelo banco (nunca de um caminho arbitrário enviado
//     pelo frontend).
//   - ordem: Storage confirmado vazio primeiro, só depois a RPC
//     transacional relacional — é o que deixa o estado mais recuperável
//     em qualquer ponto de falha (ver auditoria/desenho já aprovados).

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

const BUCKET = 'student-photos'
const LIST_PAGE_SIZE = 1000
const REMOVE_BATCH_SIZE = 500

type DeletionJob = {
  school_id: string
  school_name_snapshot: string
  status: string
  storage_objects_removed: number
}

// Lista TODOS os arquivos sob o prefixo `${schoolId}/`, em qualquer
// profundidade de subpasta (hoje só existe `<school_id>/system/...`, mas a
// RLS já admite `<school_id>/<uploader_id>/...`, então a varredura não
// assume uma estrutura fixa de 1 nível). Paginado (LIST_PAGE_SIZE por
// chamada) para suportar milhares de objetos com segurança.
async function listAllFiles(
  admin: ReturnType<typeof createClient>,
  folder: string,
): Promise<string[]> {
  const files: string[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await admin.storage.from(BUCKET).list(folder, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error(`Falha ao listar Storage (${folder || '/'}): ${error.message}`)
    const entries = data || []
    for (const entry of entries) {
      const fullPath = folder ? `${folder}/${entry.name}` : entry.name
      // Supabase Storage devolve id=null para "pastas" virtuais (nenhum
      // objeto real com esse nome, só prefixo) e um id real para arquivos.
      if (entry.id === null) {
        const nested = await listAllFiles(admin, fullPath)
        files.push(...nested)
      } else {
        files.push(fullPath)
      }
    }
    if (entries.length < LIST_PAGE_SIZE) break
    offset += LIST_PAGE_SIZE
  }
  return files
}

async function removeAllFiles(admin: ReturnType<typeof createClient>, paths: string[]): Promise<number> {
  let removed = 0
  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(index, index + REMOVE_BATCH_SIZE)
    const { error } = await admin.storage.from(BUCKET).remove(batch)
    if (error) throw new Error(`Falha ao remover objetos do Storage: ${error.message}`)
    removed += batch.length
  }
  return removed
}

// Idempotente: relista o prefixo inteiro e remove o que ainda existir.
// Numa retomada, se já estiver vazio, a listagem volta vazia e a função
// retorna imediatamente sem tentar remover nada.
async function cleanupSchoolStorage(admin: ReturnType<typeof createClient>, schoolId: string): Promise<number> {
  const paths = await listAllFiles(admin, schoolId)
  if (paths.length === 0) return 0
  return await removeAllFiles(admin, paths)
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request, { error: 'Origem não autorizada.' }, 403)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(request) })
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authorization = request.headers.get('Authorization') ?? ''

  // Cliente com o JWT real de quem chamou — usado para autorização e para
  // toda RPC que grava dado de negócio, para que auth.uid() dentro delas
  // continue sendo o proprietário de verdade.
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return json(request, { error: 'Sessão inválida.' }, 401)

  const { data: callerIsOwner, error: ownerCheckError } = await callerClient.rpc('is_platform_owner')
  if (ownerCheckError || callerIsOwner !== true) {
    return json(request, { error: 'Somente o proprietário da plataforma pode executar esta ação.' }, 403)
  }

  // Cliente privilegiado — SOMENTE para Storage, pelo motivo explicado no
  // topo do arquivo. Nunca usado para RPC nem para nenhuma tabela.
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  let schoolId: unknown
  let confirmName: unknown
  try {
    ({ schoolId, confirmName } = await request.json())
  } catch {
    return json(request, { error: 'Corpo da solicitação inválido.' }, 400)
  }
  if (typeof schoolId !== 'string' || !schoolId) {
    return json(request, { error: 'Escola inválida.' }, 400)
  }
  if (typeof confirmName !== 'string' || !confirmName) {
    return json(request, { error: 'Informe o nome exato da escola para confirmar.' }, 400)
  }

  // Ponto de não retorno: cria (ou retoma) o job. Validação de proprietário,
  // escola arquivada e nome exato acontece de novo aqui dentro, no banco,
  // com auth.uid() real — independente da checagem já feita acima.
  const { data: jobRow, error: beginError } = await callerClient.rpc('platform_begin_school_deletion', {
    p_school_id: schoolId,
    p_confirm_name: confirmName,
  })
  if (beginError) return json(request, { error: beginError.message }, 400)
  const job = jobRow as DeletionJob

  if (job.status === 'completed') {
    return json(request, {
      already_completed: true,
      school_id: job.school_id,
      school_name: job.school_name_snapshot,
    })
  }

  // school_id usado no Storage vem sempre do job já validado pelo banco —
  // nunca do valor bruto recebido no corpo da requisição.
  const validatedSchoolId = job.school_id

  await callerClient.rpc('platform_update_school_deletion_job', {
    p_school_id: validatedSchoolId,
    p_status: 'deleting_storage',
  })

  let storageObjectsRemoved: number
  try {
    storageObjectsRemoved = await cleanupSchoolStorage(admin, validatedSchoolId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida ao limpar o Storage.'
    await callerClient.rpc('platform_update_school_deletion_job', {
      p_school_id: validatedSchoolId,
      p_status: 'failed',
      p_error_message: message,
    })
    return json(request, { error: message }, 500)
  }

  await callerClient.rpc('platform_update_school_deletion_job', {
    p_school_id: validatedSchoolId,
    p_status: 'deleting_storage',
    p_storage_objects_removed: storageObjectsRemoved,
  })

  // Confirma o prefixo realmente vazio antes de seguir para a etapa
  // irreversível — não confia só no retorno de removeAllFiles.
  const remaining = await listAllFiles(admin, validatedSchoolId)
  if (remaining.length > 0) {
    const message = `Storage não confirmado vazio após a remoção (${remaining.length} objeto(s) restante(s)).`
    await callerClient.rpc('platform_update_school_deletion_job', {
      p_school_id: validatedSchoolId,
      p_status: 'failed',
      p_error_message: message,
    })
    return json(request, { error: message }, 500)
  }

  const { data: purgeResult, error: purgeError } = await callerClient.rpc('platform_purge_school_data', {
    p_school_id: validatedSchoolId,
    p_confirm_name: confirmName,
  })
  if (purgeError) {
    await callerClient.rpc('platform_update_school_deletion_job', {
      p_school_id: validatedSchoolId,
      p_status: 'failed',
      p_error_message: purgeError.message,
    })
    return json(request, { error: purgeError.message }, 500)
  }

  return json(request, purgeResult as Record<string, unknown>)
})
