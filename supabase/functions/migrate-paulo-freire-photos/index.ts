import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// FUNÇÃO TEMPORÁRIA E ESPECÍFICA — migração das fotos da Paulo Freire do
// projeto legado (ftigviorsuqucxwxqpua) para o Comercial. Origem e destino
// são fixos no código (nunca aceitos por parâmetro) para que esta function
// não possa ser reaproveitada para copiar nada além deste caso exato.
// Apagar esta function assim que a migração de fotos for concluída e
// validada — ela não deve permanecer em produção.
//
// Garantias mantidas por construção:
//   - o cliente da origem (legacyAdmin) só chama .select() no banco e
//     .list()/.download() no Storage — nenhuma chamada de escrita
//     (.insert/.update/.upsert/.delete/.upload/.remove/.move) é feita
//     através dele em nenhum ponto deste arquivo;
//   - toda escrita no destino é restrita ao prefixo fixo DEST_PREFIX,
//     validado antes de qualquer upload;
//   - public.students não é lido nem escrito no projeto Comercial por
//     esta function — o mapa vem inteiramente da leitura do legado;
//   - LEGACY_SERVICE_ROLE_KEY nunca é logada nem devolvida na resposta.

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

const LEGACY_SUPABASE_URL = 'https://ftigviorsuqucxwxqpua.supabase.co'
const LEGACY_BUCKET = 'student-photos'
const COMMERCIAL_BUCKET = 'student-photos'
const PAULO_FREIRE_SCHOOL_ID = '013f086d-5af2-4784-8644-79aa162073c4'
const PAULO_FREIRE_SLUG = 'colegio-estadual-paulo-freire'
const DEST_PREFIX = `${PAULO_FREIRE_SCHOOL_ID}/system/`

const DEFAULT_BATCH_SIZE = 20
const MAX_BATCH_SIZE = 60
const DEFAULT_MAX_SCAN = 120
const MAX_MAX_SCAN = 900
const CHECK_CONCURRENCY = 20

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') ?? ''
  if (!allowedOrigins().includes(origin)) return json(request, { error: 'Origem não autorizada.' }, 403)
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(request) })
  if (request.method !== 'POST') return json(request, { error: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const legacyServiceKey = Deno.env.get('LEGACY_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization') ?? ''

  if (!legacyServiceKey) {
    return json(request, { error: 'Configuração pendente: segredo LEGACY_SERVICE_ROLE_KEY não cadastrado neste projeto.' }, 500)
  }

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return json(request, { error: 'Sessão inválida.' }, 401)

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // Só o school_admin ativo da Paulo Freire pode acionar esta migração.
  const { data: callerMember, error: callerMemberError } = await admin
    .from('school_members')
    .select('id, role')
    .eq('school_id', PAULO_FREIRE_SCHOOL_ID)
    .eq('user_id', caller.id)
    .eq('status', 'active')
    .maybeSingle()
  if (callerMemberError) return json(request, { error: 'Não foi possível validar seu acesso.' }, 500)
  if (!callerMember || callerMember.role !== 'school_admin') {
    return json(request, { error: 'Somente o administrador da Paulo Freire pode executar esta migração.' }, 403)
  }

  let batchSize = DEFAULT_BATCH_SIZE
  let maxScan = DEFAULT_MAX_SCAN
  let linkPhotoPaths = false
  let validatePhotoLinksOnly = false
  let includePhotoMap = false
  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    if (typeof body?.batchSize === 'number' && Number.isFinite(body.batchSize)) {
      batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(body.batchSize)))
    }
    if (typeof body?.maxScan === 'number' && Number.isFinite(body.maxScan)) {
      maxScan = Math.max(batchSize, Math.min(MAX_MAX_SCAN, Math.floor(body.maxScan)))
    }
    linkPhotoPaths = body?.linkPhotoPaths === true
    validatePhotoLinksOnly = body?.validatePhotoLinksOnly === true
    includePhotoMap = body?.includePhotoMap === true
  } catch { /* body opcional */ }

  // Cliente da ORIGEM: exclusivamente leitura.
  const legacyAdmin = createClient(LEGACY_SUPABASE_URL, legacyServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: legacyRows, error: legacyError } = await legacyAdmin
    .from('students')
    .select('id, photo_path, schools!inner(slug)')
    .eq('schools.slug', PAULO_FREIRE_SLUG)
    .not('photo_path', 'is', null)
    .order('photo_path')

  if (legacyError) {
    return json(request, { error: `Não foi possível ler o mapa de fotos da origem: ${legacyError.message}` }, 500)
  }

  type MapItem = { studentId: string; legacyPath: string; commercialPath: string }
  const map: MapItem[] = []
  for (const row of legacyRows || []) {
    const legacyPath = String(row.photo_path)
    const parts = legacyPath.split('/')
    const filename = parts[parts.length - 1]
    if (!filename) continue
    const commercialPath = `${DEST_PREFIX}${filename}`
    // Defesa redundante: a function só pode gravar sob o prefixo fixo.
    if (!commercialPath.startsWith(DEST_PREFIX)) continue
    map.push({ studentId: String(row.id), legacyPath, commercialPath })
  }

  const totalMapped = map.length
  let scanned = 0
  let alreadyExisting = 0
  let copied = 0
  const failed: Array<{ legacyPath: string; reason: string }> = []

  // Checagem leve de existência + tamanho (metadata), sem baixar nada.
  // Só decide se o item já está corretamente copiado ou precisa ser copiado —
  // nenhuma decisão diferente da versão anterior, só a forma de disparar.
  type CheckResult =
    | { kind: 'already' }
    | { kind: 'mismatch' | 'checkFailed'; reason: string }
    | { kind: 'needsCopy' }

  async function checkItem(item: MapItem): Promise<CheckResult> {
    const folder = item.commercialPath.slice(0, item.commercialPath.lastIndexOf('/'))
    const filename = item.commercialPath.slice(item.commercialPath.lastIndexOf('/') + 1)
    const listing = await admin.storage.from(COMMERCIAL_BUCKET).list(folder, { search: filename, limit: 1 })
    if (listing.error) {
      return { kind: 'checkFailed', reason: `Falha ao verificar o destino: ${listing.error.message}` }
    }
    const destinationEntry = (listing.data || []).find(entry => entry.name === filename)
    if (!destinationEntry) return { kind: 'needsCopy' }

    const legacyFolder = item.legacyPath.slice(0, item.legacyPath.lastIndexOf('/'))
    const legacyFilename = item.legacyPath.slice(item.legacyPath.lastIndexOf('/') + 1)
    const sourceListing = await legacyAdmin.storage.from(LEGACY_BUCKET)
      .list(legacyFolder, { search: legacyFilename, limit: 1 })
    if (sourceListing.error) {
      return { kind: 'checkFailed', reason: `Falha ao verificar os metadados da origem: ${sourceListing.error.message}` }
    }
    const sourceEntry = (sourceListing.data || []).find(entry => entry.name === legacyFilename)
    const sourceSize = Number(sourceEntry?.metadata?.size)
    const destinationSize = Number(destinationEntry.metadata?.size)

    if (!sourceEntry || !Number.isFinite(sourceSize) || !Number.isFinite(destinationSize)) {
      return { kind: 'checkFailed', reason: 'Objeto já existe no destino, mas não foi possível confirmar os tamanhos pelos metadados.' }
    }
    if (sourceSize === destinationSize) return { kind: 'already' }
    return {
      kind: 'mismatch',
      reason: `Objeto já existe no destino com tamanho divergente (origem=${sourceSize}, destino=${destinationSize}); nenhuma sobrescrita foi feita.`,
    }
  }

  // Cópia efetiva (download → upload → releitura → SHA-256) — sempre
  // sequencial, uma foto nova de cada vez, nunca em paralelo.
  async function copyItem(item: MapItem): Promise<{ ok: true } | { ok: false; reason: string }> {
    const sourceDownload = await legacyAdmin.storage.from(LEGACY_BUCKET).download(item.legacyPath)
    if (sourceDownload.error || !sourceDownload.data) {
      return { ok: false, reason: `Falha ao baixar da origem: ${sourceDownload.error?.message || 'erro desconhecido'}` }
    }
    const sourceBytes = new Uint8Array(await sourceDownload.data.arrayBuffer())
    const sourceHash = await sha256Hex(sourceBytes)

    const upload = await admin.storage.from(COMMERCIAL_BUCKET).upload(item.commercialPath, sourceBytes, {
      contentType: 'image/jpeg',
      upsert: false,
    })
    if (upload.error) return { ok: false, reason: `Falha ao enviar ao destino: ${upload.error.message}` }

    const verify = await admin.storage.from(COMMERCIAL_BUCKET).download(item.commercialPath)
    if (verify.error || !verify.data) return { ok: false, reason: 'Upload feito, mas não foi possível reler para confirmar.' }
    const verifyHash = await sha256Hex(new Uint8Array(await verify.data.arrayBuffer()))
    if (verifyHash !== sourceHash) return { ok: false, reason: 'SHA-256 do destino não confere com a origem após o envio.' }
    return { ok: true }
  }

  if (linkPhotoPaths || validatePhotoLinksOnly) {
    // A vinculação só começa depois que o mapa inteiro foi revalidado contra
    // os objetos físicos. Nenhuma foto é copiada neste modo.
    for (let index = 0; index < map.length; index += CHECK_CONCURRENCY) {
      const chunk = map.slice(index, index + CHECK_CONCURRENCY)
      const results = await Promise.all(chunk.map(checkItem))
      for (let i = 0; i < results.length; i++) {
        if (results[i].kind !== 'already') {
          const result = results[i]
          failed.push({
            legacyPath: chunk[i].legacyPath,
            reason: result.kind === 'needsCopy'
              ? 'Objeto físico ainda não existe no destino; vinculação cancelada.'
              : result.reason,
          })
        }
      }
    }

    if (failed.length > 0 || map.length !== 858) {
      return json(request, {
        totalMapped,
        linkedThisRun: 0,
        failed,
        note: 'Vinculação cancelada antes de qualquer UPDATE porque a validação física completa não passou.',
      }, validatePhotoLinksOnly ? 200 : 409)
    }

    if (validatePhotoLinksOnly) {
      return json(request, {
        totalMapped,
        validated: map.length,
        linkedThisRun: 0,
        failed,
        ...(includePhotoMap ? { photoMap: map.map(item => ({ studentId: item.studentId, commercialPath: item.commercialPath })) } : {}),
        note: 'Validação concluída sem UPDATE em public.students.',
      })
    }

    let linkedThisRun = 0
    for (let index = 0; index < map.length; index += CHECK_CONCURRENCY) {
      const chunk = map.slice(index, index + CHECK_CONCURRENCY)
      const results = await Promise.all(chunk.map(async item => {
        const { data, error } = await admin
          .from('students')
          .update({ photo_path: item.commercialPath })
          .eq('id', item.studentId)
          .eq('school_id', PAULO_FREIRE_SCHOOL_ID)
          .select('id, photo_path')
          .maybeSingle()
        if (error) return { item, reason: error.message }
        if (!data || data.photo_path !== item.commercialPath) {
          return { item, reason: 'Aluno não encontrado na escola Comercial ou vínculo não confirmado.' }
        }
        return { item, reason: null }
      }))

      for (const result of results) {
        if (result.reason) failed.push({ legacyPath: result.item.legacyPath, reason: result.reason })
        else linkedThisRun++
      }
      if (failed.length > 0) break
    }

    return json(request, {
      totalMapped,
      linkedThisRun,
      failed,
      note: 'Somente public.students.photo_path no projeto Comercial foi atualizado; nenhuma escrita foi feita na origem.',
    }, failed.length > 0 ? 500 : 200)
  }

  let index = 0
  while (index < map.length && scanned < maxScan && copied < batchSize) {
    const remainingScan = maxScan - scanned
    const chunkSize = Math.min(CHECK_CONCURRENCY, remainingScan, map.length - index)
    const chunk = map.slice(index, index + chunkSize)
    index += chunk.length

    // Paralelização controlada (até CHECK_CONCURRENCY por vez) só das
    // checagens leves de existência/tamanho — cada foto nova ainda é
    // baixada/enviada/validada sequencialmente logo abaixo.
    const results = await Promise.all(chunk.map(checkItem))

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const item = chunk[i]
      scanned++

      if (result.kind === 'already') { alreadyExisting++; continue }
      if (result.kind === 'mismatch' || result.kind === 'checkFailed') {
        failed.push({ legacyPath: item.legacyPath, reason: result.reason })
        continue
      }
      if (copied >= batchSize) continue

      const copyResult = await copyItem(item)
      if (copyResult.ok) copied++
      else failed.push({ legacyPath: item.legacyPath, reason: copyResult.reason })
    }
  }

  return json(request, {
    totalMapped,
    scannedThisRun: scanned,
    alreadyExisting,
    copiedThisRun: copied,
    failed,
    fullyScanned: scanned < maxScan || scanned >= totalMapped,
    note: 'students.photo_path não foi alterado por esta function. Nenhuma escrita foi feita na origem.',
  })
})
