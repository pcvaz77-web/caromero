document.addEventListener('DOMContentLoaded', () => {
  const CONTACT_EMAIL = 'contato@sistemacarometro.com.br';
  const CONTACT_WHATSAPP = '5561998971069';
  let schoolContextReady = false;
  document.addEventListener('carometro:school-context-ready', () => { schoolContextReady = true; });

  const style = document.createElement('style');
  style.textContent = `
    #contactNav{margin-top:6px;background:#243654;color:#dce6f8;border:1px solid #3a4e72}
    #contactNav:hover,#contactNav:focus{background:#38527e;color:#fff}
    .contact-dialog{width:min(580px,100%);overflow:hidden}.contact-body{padding:24px}.contact-intro{margin:0 0 18px;color:#667085;line-height:1.55}.contact-options{display:grid;grid-template-columns:1fr 1fr;gap:13px}.contact-option{display:flex;align-items:center;gap:13px;border:1px solid #dce2ec;border-radius:14px;padding:17px;background:#fff;color:#17233a;text-decoration:none;transition:.18s ease}.contact-option:hover,.contact-option:focus{border-color:#7ca0ef;box-shadow:0 8px 22px #1f4fa318;transform:translateY(-1px)}.contact-option-icon{width:46px;height:46px;flex:none;border-radius:13px;display:grid;place-items:center}.contact-option-icon svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.contact-email .contact-option-icon{background:#edf2ff;color:#315fca}.contact-whatsapp .contact-option-icon{background:#e5f8ee;color:#079456}.contact-option strong{display:block;font-size:15px}.contact-option span{display:block;margin-top:4px;color:#667085;font-size:12px;line-height:1.4}.contact-safety{margin-top:16px;padding:11px 13px;border-radius:10px;background:#f7f9fc;color:#667085;font-size:12px;line-height:1.45}@media(max-width:620px){.contact-options{grid-template-columns:1fr}.contact-body{padding:18px}}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = 'contactNav';
  button.type = 'button';
  button.innerHTML = '<span aria-hidden="true">&#9993;</span>&nbsp; Fale conosco';
  button.setAttribute('aria-label', 'Fale conosco');
  const nav = document.querySelector('.side .nav');
  nav?.insertBefore(button, document.getElementById('profileNav') || null);

  const modal = document.createElement('div');
  modal.id = 'contactModal';
  modal.className = 'modal-bg hidden';
  modal.innerHTML = `<section class="modal contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contactTitle"><div class="modal-head"><div><h3 id="contactTitle">Fale conosco</h3><div class="meta">Escolha como podemos ajudar.</div></div><button class="close" type="button" data-contact-close aria-label="Fechar">×</button></div><div class="contact-body"><p class="contact-intro">Envie uma ideia para melhorar o Carômetro ou fale diretamente conosco quando precisar de ajuda para utilizar o sistema.</p><div class="contact-options"><a id="contactSuggestion" class="contact-option contact-email" href="#"><span class="contact-option-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6.5h18v11H3z"/><path d="m4 7 8 6 8-6"/></svg></span><span><strong>Enviar uma sugestão</strong><span>Abra seu e-mail com o assunto e o contexto preenchidos.</span></span></a><a id="contactQuestion" class="contact-option contact-whatsapp" href="#" target="_blank" rel="noopener"><span class="contact-option-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4.1A8 8 0 1 1 20 11.6Z"/><path d="M9 8.3c.4 2.7 2.1 4.4 4.8 5.2l1.2-1.1 2 1.1c-.3 1.7-1.3 2.4-2.8 2.2-4-.6-7.1-3.7-7.7-7.7-.2-1.5.5-2.5 2.2-2.8l1.1 2Z"/></svg></span><span><strong>Dúvida de uso</strong><span>Converse pelo WhatsApp para receber orientação.</span></span></a></div><div class="contact-safety">Para proteger a privacidade, não envie senhas nem dados pessoais de alunos.</div></div></section>`;
  document.body.appendChild(modal);

  const close = () => modal.classList.add('hidden');
  const waitForSchoolContext = async () => {
    if (schoolContextReady || window.getActiveSchoolMembership?.()) return;
    await new Promise(resolve => {
      const finish = () => { schoolContextReady = true; resolve(); };
      document.addEventListener('carometro:school-context-ready', finish, { once:true });
      setTimeout(resolve, 2500);
    });
  };
  const contactContext = async () => {
    await waitForSchoolContext();
    const activeSchoolId = window.getActiveSchoolId?.() || null;
    const membership = window.getActiveSchoolMembership?.();
    let school = membership?.school_id === activeSchoolId ? membership.name : '';
    if (!school && activeSchoolId) {
      const { data:activeSchool } = await db.from('schools').select('name').eq('id', activeSchoolId).maybeSingle();
      school = activeSchool?.name || '';
    }
    if (!school) school = 'Administração da plataforma';
    const role = document.getElementById('roleLabel')?.textContent?.trim() || window.getActiveSchoolRole?.() || 'Não informado';
    const { data:{ user } } = await db.auth.getUser();
    let name = user?.user_metadata?.full_name?.trim() || user?.email?.split('@')[0] || 'Não informado';
    if (user?.id) {
      const { data:profile } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      if (profile?.full_name?.trim()) name = profile.full_name.trim();
    }
    return { school, role, name, email: user?.email || 'Não informado' };
  };
  const open = async () => {
    button.disabled = true;
    try {
      const { school, role, name, email } = await contactContext();
      const subject = 'Sugestão para o Carômetro';
      const body = `Olá! Gostaria de enviar uma sugestão para o Carômetro.\n\nNome: ${name}\nE-mail: ${email}\nEscola: ${school}\nPerfil: ${role}\nVersão: web\n\nMinha sugestão:\n`;
      modal.querySelector('#contactSuggestion').href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const message = `Olá! Preciso de ajuda para usar o Carômetro.\n\nNome: ${name}\nE-mail: ${email}\nEscola: ${school}\nPerfil: ${role}\n\nMinha dúvida:`;
      modal.querySelector('#contactQuestion').href = `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(message)}`;
      modal.classList.remove('hidden');
    } finally {
      button.disabled = false;
    }
  };

  button.onclick = open;
  modal.querySelector('[data-contact-close]').onclick = close;
  modal.onclick = event => { if (event.target === modal) close(); };
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
});
