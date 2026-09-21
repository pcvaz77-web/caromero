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

  const testimonialsCarousel = document.querySelector('[data-testimonials-carousel]');
  if (testimonialsCarousel) {
    let carouselVisible = false;
    const updateCarouselMotion = () => {
      testimonialsCarousel.classList.toggle('is-running', carouselVisible && !document.hidden);
    };
    const observer = new IntersectionObserver(entries => {
      carouselVisible = entries.some(entry => entry.isIntersecting);
      updateCarouselMotion();
    }, { threshold:0.08 });
    observer.observe(testimonialsCarousel);
    document.addEventListener('visibilitychange', updateCarouselMotion);
  }

  document.querySelectorAll('.youtube-embed').forEach(container => {
    const id = (container.dataset.youtubeId || '').trim();
    const button = container.querySelector('.youtube-play');
    if (!button || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    button.disabled = false;
    button.removeAttribute('aria-disabled');
    button.querySelector('strong').textContent = 'Assistir agora';
    button.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`;
      iframe.title = container.dataset.videoTitle || 'Vídeo do Assistente SIAP';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.allowFullscreen = true;
      container.replaceChildren(iframe);
    }, { once:true });
  });

  // A extensão abre diretamente #planos ao oferecer renovação.
  // Uma visita inicial à página pública continua mostrando a demonstração.
  if (window.location.hash === '#planos') {
    const trialCard = document.querySelector('.trial-card');
    if (trialCard) trialCard.style.display = 'none';
  }

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
  client.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return;
    const { data: access, error } = await client.rpc('get_siap_assistant_access_status');
    if (error || !access) return;
    const remainingUses = Object.values(access.freeUses || {}).map(remaining => Number(remaining));
    const neverUsedTrial = access.status === 'free'
      && remainingUses.length === 4
      && remainingUses.every(remaining => remaining === 2);
    if (!neverUsedTrial) {
      const trialCard = document.querySelector('.trial-card');
      if (trialCard) trialCard.style.display = 'none';
    }
  }).catch(() => {});
  const offerResult = client.from('siap_exam_offers').select('offer_key,amount,active');
  client.from('siap_assistant_plans').select('plan_key,amount,billing_months').eq('active', true).order('display_order')
    .then(async ({ data, error }) => {
      if (error) return;
      const {data:offers=[]}=await offerResult;
      document.querySelectorAll('[data-exam-offer]').forEach(button=>{const offer=(offers||[]).find(o=>o.offer_key===button.dataset.examOffer&&o.active);button.disabled=!offer;button.onclick=()=>location.assign('assistente-siap-conta.html?plano='+encodeURIComponent(button.dataset.examOffer));});
      const salesStatus=document.querySelector('[data-exam-sales-status]');
      if(salesStatus) salesStatus.textContent=(offers||[]).some(o=>['exam_one','exam_four'].includes(o.offer_key)&&o.active)?'Pagamento seguro. Liberação após a confirmação da compra.':'Compra avulsa aguardando liberação da plataforma de pagamento.';
      (data || []).forEach(plan => {
        const button = document.querySelector(`[data-assistant-plan="${plan.plan_key}"]`);
        const card = button?.closest('.price-card');
        if (!button || !card || !plan.amount) return;
        const period = Number(plan.billing_months) === 1 ? 'mês' : `${Number(plan.billing_months)} meses`;
        card.querySelector('.price').textContent = `${money(plan.amount)} / ${period}`;
        button.disabled = false;
        button.textContent = 'Assinar agora';
        const addon=document.querySelector(`[data-exam-addon="${plan.plan_key}"]`);
        const update=()=>{
          const offer=(offers||[]).find(o=>o.offer_key===plan.plan_key+'_exam');
          const extra=Number(plan.billing_months)===1?35:45;
          const chosen=addon?.checked;
          card.querySelector('.price').textContent=`${money(Number(plan.amount)+(chosen?extra:0))} / ${period}`;
          button.disabled=!!chosen&&(!offer?.active||Number(offer.amount)!==Number(plan.amount)+extra);
          const hint=card.querySelector('[data-addon-status]');if(hint)hint.textContent=chosen?(button.disabled?'Oferta com correção em preparação.':'Correção incluída durante todo o plano.'):'Correção não incluída.';
          button.onclick=()=>location.assign(`assistente-siap-conta.html?plano=${encodeURIComponent(plan.plan_key+(chosen?'_exam':''))}`);
        };if(addon)addon.onchange=update;update();
      });
    });
})();
