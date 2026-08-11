import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function movePhotosOwnedBy(
  admin: ReturnType<typeof createClient>,
  ownerId: string,
) {
  const bucket = admin.storage.from('student-photos')
  const { data: files, error } = await bucket.list(ownerId, { limit: 1000 })
  if (error) throw new Error('Não foi possível verificar as fotos do usuário.')

  for (const file of files ?? []) {
    if (!file.name) continue
    const oldPath = `${ownerId}/${file.name}`
    const { data: fileData, error: downloadError } = await bucket.download(oldPath)
    if (downloadError || !fileData) throw new Error('Não foi possível preservar as fotos do usuário.')

    const newPath = `system/${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await bucket.upload(newPath, fileData, { upsert: false })
    if (uploadError) throw new Error('Não foi possível transferir as fotos do usuário.')

    const { error: studentError } = await admin.from('students').update({ photo_path: newPath }).eq('photo_path', oldPath)
    if (studentError) throw new Error('Não foi possível atualizar as fotos dos alunos.')
    const { error: removeError } = await bucket.remove([oldPath])
    if (removeError) throw new Error('Não foi possível concluir a transferência das fotos.')
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authorization = request.headers.get('Authorization') ?? ''

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return json({ error: 'Sessão inválida.' }, 401)

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: callerPermission } = await admin.from('user_permissions').select('role').eq('user_id', caller.id).single()
  if (callerPermission?.role !== 'admin') return json({ error: 'Somente o administrador principal pode executar esta ação.' }, 403)

  const { action, userId } = await request.json()
  if (!['cancel_login', 'permanent_delete'].includes(action) || typeof userId !== 'string') {
    return json({ error: 'Ação inválida.' }, 400)
  }
  if (userId === caller.id) return json({ error: 'Você não pode remover a própria conta.' }, 400)

  const { data: targetPermission } = await admin.from('user_permissions').select('role').eq('user_id', userId).single()
  if (targetPermission?.role === 'admin') return json({ error: 'O administrador principal não pode ser removido.' }, 400)

  const { data: targetProfile } = await admin.from('profiles').select('email,full_name').eq('id', userId).single()
  if (!targetProfile?.email) return json({ error: 'Usuário não encontrado.' }, 404)

  // Suspende antes da exclusão para encerrar a sessão aberta imediatamente.
  await admin.from('user_permissions').update({ access_status: 'suspended', updated_at: new Date().toISOString() }).eq('user_id', userId)
  await movePhotosOwnedBy(admin, userId)

  if (action === 'cancel_login') {
    const { error: archiveError } = await admin.from('cancelled_logins').insert({
      former_user_id: userId,
      email: targetProfile.email,
      full_name: targetProfile.full_name ?? null,
      cancelled_by: caller.id,
    })
    if (archiveError) return json({ error: 'Não foi possível registrar o cancelamento.' }, 500)
  } else {
    await admin.from('cancelled_logins').delete().eq('former_user_id', userId)
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) return json({ error: deleteError.message }, 400)

  // Protege instalações antigas que não possuem exclusão em cascata.
  await admin.from('user_permissions').delete().eq('user_id', userId)
  await admin.from('profiles').delete().eq('id', userId)
  return json({ ok: true })
})
