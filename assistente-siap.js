(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('siteNav');
  const params = new URLSearchParams(window.location.search);
  const institutionalAccess = params.get('origem') === 'carometro';

  toggle?.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
  }));

  document.getElementById('currentYear').textContent = String(new Date().getFullYear());

  if (institutionalAccess) {
    document.body.classList.add('institutional-access');
    document.querySelector('[data-public-checkout]')?.setAttribute('hidden', '');
    const institutionalInstall = document.getElementById('acesso-institucional');
    institutionalInstall?.removeAttribute('hidden');
    document.querySelectorAll('a[href="#planos"]').forEach(link => {
      link.setAttribute('href', '#acesso-institucional');
      if (link.classList.contains('button')) link.textContent = 'Instalar extensão';
    });
    return;
  }

  const money = value => Number(value).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
  const config = window.CAROMETRO_RUNTIME_CONFIG;
  if (!config?.backendConfigured || !window.supabase?.createClient) return;
  const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
  client.from('siap_assistant_plans').select('plan_key,amount,billing_months').eq('active', true).order('display_order')
    .then(({ data, error }) => {
      if (error) return;
      (data || []).forEach(plan => {
        const button = document.querySelector(`[data-assistant-plan="${plan.plan_key}"]`);
        const card = button?.closest('.price-card');
        if (!button || !card || !plan.amount) return;
        const period = Number(plan.billing_months) === 1 ? 'mês' : `${Number(plan.billing_months)} meses`;
        card.querySelector('.price').textContent = `${money(plan.amount)} / ${period}`;
        button.disabled = false;
        button.textContent = 'Assinar agora';
        button.onclick = () => location.assign(`assistente-siap-conta.html?plano=${encodeURIComponent(plan.plan_key)}`);
      });
    });
})();
