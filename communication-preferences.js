// Escolhas individuais para novidades. Nenhum canal é habilitado por padrão.
(() => {
  const normalizePhone = value => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    const full = digits.length === 10 || digits.length === 11 ? '55' + digits : digits;
    return /^[1-9][0-9]{7,14}$/.test(full) ? '+' + full : null;
  };

  function mount() {
    const nav = document.querySelector('#app .nav');
    if (!nav || document.getElementById('communicationPreferencesNav')) return;
    const button = document.createElement('button');
    button.id = 'communicationPreferencesNav';
    button.type = 'button';
    button.textContent = '✉  Minhas comunicações';
    nav.appendChild(button);

    const modal = document.createElement('div');
    modal.id = 'communicationPreferencesModal';
    modal.className = 'modal-bg hidden';
    modal.innerHTML = `<section class="modal small communication-preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="communicationPreferencesTitle">
      <div class="modal-head"><h3 id="communicationPreferencesTitle">Minhas comunicações</h3><button type="button" class="close" data-communication-close aria-label="Fechar">×</button></div>
      <form id="communicationPreferencesForm" class="form">
        <p>Escolha se deseja receber novidades, avisos e orientações do Carômetro. Você pode mudar de ideia quando quiser.</p>
        <div class="field"><label for="communicationPhone">WhatsApp com DDD (opcional)</label><input id="communicationPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(61) 99999-9999"></div>
        <label class="communication-choice"><input id="communicationEmailOptIn" type="checkbox"><span>Receber novidades e avisos por e-mail</span></label>
        <label class="communication-choice"><input id="communicationWhatsAppOptIn" type="checkbox"><span>Receber novidades e avisos pelo WhatsApp informado</span></label>
        <p class="meta">Essas escolhas não afetam seu acesso nem avisos essenciais da conta.</p>
        <p id="communicationPreferencesError" class="error hidden" role="alert"></p>
        <button class="btn primary" type="submit">Salvar escolhas</button>
      </form>
    </section>`;
    document.body.appendChild(modal);
    const style = document.createElement('style');
    style.textContent = '.communication-preferences-dialog{width:min(520px,calc(100vw - 24px));max-height:calc(100dvh - 30px);overflow:auto}.communication-preferences-dialog .form{padding:20px}.communication-choice{display:flex;align-items:flex-start;gap:10px;margin:12px 0;font-weight:650}.communication-choice input{width:18px;height:18px;flex:0 0 18px;margin:2px 0}.communication-preferences-dialog .field input{width:100%}';
    document.head.appendChild(style);
    const close = () => modal.classList.add('hidden');
    modal.querySelector('[data-communication-close]').onclick = close;
    modal.onclick = event => { if (event.target === modal) close(); };

    button.onclick = async () => {
      const error = document.getElementById('communicationPreferencesError');
      error.classList.add('hidden');
      const { data:{ user } } = await db.auth.getUser();
      if (!user) return;
      const { data, error:loadError } = await db.from('platform_communication_preferences')
        .select('whatsapp_e164,email_updates,whatsapp_updates').eq('user_id',user.id).maybeSingle();
      if (loadError) { toast('Não foi possível abrir suas escolhas de comunicação.'); return; }
      document.getElementById('communicationPhone').value = data?.whatsapp_e164 || '';
      document.getElementById('communicationEmailOptIn').checked = data?.email_updates === true;
      document.getElementById('communicationWhatsAppOptIn').checked = data?.whatsapp_updates === true;
      modal.classList.remove('hidden');
    };

    document.getElementById('communicationPreferencesForm').onsubmit = async event => {
      event.preventDefault();
      const error = document.getElementById('communicationPreferencesError');
      const rawPhone = document.getElementById('communicationPhone').value.trim();
      const phone = normalizePhone(rawPhone);
      const emailUpdates = document.getElementById('communicationEmailOptIn').checked;
      const whatsappUpdates = document.getElementById('communicationWhatsAppOptIn').checked;
      if ((rawPhone && !phone) || (whatsappUpdates && !phone)) {
        error.textContent = 'Informe um WhatsApp válido com DDD.';
        error.classList.remove('hidden');
        return;
      }
      const { data:{ user } } = await db.auth.getUser();
      if (!user) { close(); return; }
      const save = modal.querySelector('button[type="submit"]');
      save.disabled = true;
      try {
        const { error:saveError } = await db.from('platform_communication_preferences').upsert({
          user_id:user.id, whatsapp_e164:phone, email_updates:emailUpdates, whatsapp_updates:whatsappUpdates
        }, { onConflict:'user_id' });
        if (saveError) throw saveError;
        close();
        toast('Suas escolhas foram salvas.');
      } catch {
        error.textContent = 'Não foi possível salvar suas escolhas. Tente novamente.';
        error.classList.remove('hidden');
      } finally { save.disabled = false; }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
  else mount();
})();
