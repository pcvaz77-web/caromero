async function dispatch(env, body = '{}') {
  if (!env.REMINDER_ENDPOINT || !env.SIAP_REMINDER_CRON_SECRET) {
    throw new Error('Agendador de lembretes incompleto.');
  }

  const response = await fetch(env.REMINDER_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-cron-secret': env.SIAP_REMINDER_CRON_SECRET
    },
    body
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Lembretes responderam HTTP ${response.status}: ${responseBody.slice(0, 300)}`);
  }
  return responseBody;
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(dispatch(env));
  },

  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const authorization = request.headers.get('authorization') || '';
    if (!env.SIAP_REMINDER_CRON_SECRET || authorization !== `Bearer ${env.SIAP_REMINDER_CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    try {
      const requestBody = await request.text();
      const body = await dispatch(env, requestBody || '{}');
      return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8' } });
    } catch (error) {
      return new Response(String(error?.message || error), { status: 502 });
    }
  }
};
