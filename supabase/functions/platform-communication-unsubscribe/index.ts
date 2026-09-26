import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const page = (message:string, token:string|null, done=false) => new Response(
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comunicações do Carômetro</title><body style="font-family:Arial,sans-serif;background:#eef2f8;color:#17233a;padding:30px"><main style="max-width:480px;margin:40px auto;background:white;border-radius:16px;padding:32px"><h1 style="font-size:24px">Comunicações do Carômetro</h1><p>${message}</p>${!done && token ? `<form method="post"><input type="hidden" name="token" value="${token}"><button style="padding:13px 20px;border:0;border-radius:8px;background:#315dbb;color:white;cursor:pointer">Parar de receber comunicados por e-mail</button></form>` : ''}</main></body></html>`,
  {status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}}
)
Deno.serve(async request => {
  const url = new URL(request.url)
  if (request.method === 'GET') {
    const token = url.searchParams.get('token')
    return page(token && /^[0-9a-f-]{36}$/i.test(token)
      ? 'Confirme abaixo para deixar de receber comunicados por e-mail. Seu acesso ao Carômetro continuará funcionando.'
      : 'Este link não é válido.',token && /^[0-9a-f-]{36}$/i.test(token) ? token : null)
  }
  if (request.method !== 'POST') return new Response('Método não permitido.',{status:405})
  const form = await request.formData().catch(()=>null)
  const token = String(form?.get('token') || '')
  if (!/^[0-9a-f-]{36}$/i.test(token)) return page('Este link não é válido.',null)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return new Response('Serviço indisponível.',{status:503})
  const admin = createClient(supabaseUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}})
  const {data,error} = await admin.from('platform_communication_preferences')
    .update({email_updates:false}).eq('unsubscribe_token',token).select('user_id').maybeSingle()
  if (error || !data) return page('Este link não está mais disponível.',null)
  return page('Pronto. Você não receberá mais comunicados por e-mail. Pode alterar sua escolha no Carômetro quando quiser.',null,true)
})
