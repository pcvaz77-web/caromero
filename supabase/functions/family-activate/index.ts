import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const phoneFormat = /^\+[1-9][0-9]{7,14}$/;
// O e-mail técnico não é pedido à família nem recebe mensagens.
const familyEmail = (phone: string) => `familia-${phone.slice(1)}@sistemacarometro.com.br`;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Método inválido.' }, 405);

  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply({ error: 'Solicitação inválida.' }, 400);
    const input = JSON.parse(raw) as { token?: unknown; phone?: unknown; password?: unknown; action?: unknown };
    if (typeof input.token !== 'string' || !uuid.test(input.token)
      || typeof input.phone !== 'string' || !phoneFormat.test(input.phone)
      || (input.action != null && input.action !== 'preview')
      || (input.action !== 'preview' && (typeof input.password !== 'string'
        || input.password.length < 12 || input.password.length > 128))) {
      return reply({ error: 'Confira o convite, o celular e a senha de pelo menos 12 caracteres.' }, 400);
    }

    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return reply({ error: 'Serviço indisponível.' }, 503);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: link, error: linkError } = await admin.from('family_links')
      .select('id,school_id,student_id,phone_e164,status,invitation_expires_at,invitation_batch_id')
      .eq('invitation_token', input.token).maybeSingle();
    if (linkError || !link || link.status !== 'pending'
      || link.phone_e164 !== input.phone
      || new Date(link.invitation_expires_at).getTime() <= Date.now()) {
      return reply({ error: 'Convite inválido ou vencido. Solicite outro à escola.' }, 400);
    }

    const { data: school, error: schoolError } = await admin.from('schools')
      .select('id').eq('id',link.school_id).eq('status','active').maybeSingle();
    if (schoolError || !school) return reply({ error: 'Convite indisponível. Consulte a escola.' }, 400);

    const { data: bundle, error: bundleError } = link.invitation_batch_id
      ? await admin.from('family_links').select('student_id,school_id,phone_e164,status,invitation_expires_at')
        .eq('invitation_batch_id',link.invitation_batch_id)
      : { data:[link], error:null };
    if (bundleError || !bundle?.length || bundle.some(item => item.school_id !== link.school_id
      || item.phone_e164 !== input.phone || item.status !== 'pending'
      || new Date(item.invitation_expires_at).getTime() <= Date.now())) {
      return reply({ error: 'Convite indisponível. Consulte a escola.' }, 400);
    }
    const studentIds = bundle.map(item => item.student_id);
    const { data: students, error: studentError } = await admin.from('students')
      .select('id,full_name,class_name,class_id').eq('school_id',link.school_id)
      .eq('enrollment_status','active').in('id',studentIds);
    if (studentError || !students || students.length !== studentIds.length) {
      return reply({ error: 'Convite indisponível. Consulte a escola.' }, 400);
    }
    if (input.action === 'preview') {
      const classIds = [...new Set(students.map(student => student.class_id).filter(Boolean))];
      const { data: classes, error: classError } = classIds.length
        ? await admin.from('classes').select('id,name').eq('school_id',link.school_id).in('id',classIds)
        : { data:[], error:null };
      if (classError) return reply({ error: 'Não foi possível consultar as turmas.' }, 500);
      const classNames = new Map((classes || []).map(row => [row.id,row.name]));
      return reply({ students:students.map(student => ({ name:student.full_name,
        class_name:classNames.get(student.class_id) || student.class_name })) });
    }


    const { error: createError } = await admin.auth.admin.createUser({
      email: familyEmail(input.phone),
      password: input.password,
      email_confirm: true,
      app_metadata: { family_portal: true },
    });
    if (createError) {
      // Uma conta existente não pode ser assumida apenas com um convite de outra escola.
      if (createError.code === 'email_exists' || createError.code === 'user_already_exists') {
        return reply({ existing: true });
      }
      return reply({ error: 'Não foi possível criar o acesso. Consulte o suporte.' }, 500);
    }
    return reply({ created: true });
  } catch {
    return reply({ error: 'Solicitação inválida.' }, 400);
  }
});
