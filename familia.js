(function () {
  document.addEventListener('DOMContentLoaded', async () => {
    const config = window.CAROMETRO_RUNTIME_CONFIG;
    if (!config?.backendConfigured || !window.supabase) return;
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope:'./' }).catch(() => {});
    const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
    const get = id => document.getElementById(id);
    const esc = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
    const token = new URL(location.href).searchParams.get('token');
    let links = [];
    let digitalEnabledSchools = new Set();
    let selectedLink = null;
    let previewedPhone = null;
    let installPrompt = null;
    let installedThisSession = false;
    let familyUserId = null;
    let sessionGeneration = 0;
    let claimInFlight = Promise.resolve();
    let liveChannel = null;
    let livePoll = null;
    let refreshBusy = false;
    let lastFeedSignature = '';
    let historyCategory = null;
    let historyOffset = 0;
    let historyRequest = 0;
    const historyPageSize = 50;
    let digitalCanvas = null;
    let digitalQrCanvas = null;
    let digitalCardFile = null;
    let digitalCardName = '';
    let digitalShowingQr = false;
    let digitalRequest = 0;
    const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const isAppleMobile = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const supportsPush = () => window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const pushStatus = message => { get('familyPushStatus').textContent = message; };
    const installHelp = message => { for (const id of ['installFamilyHelp','installFamilyAccessHelp']) { get(id).textContent = message; get(id).classList.toggle('hidden', !message); } };
    const vapidKey = () => {
      const value = config.vapidPublicKey || '';
      const padded = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
      return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
    };
    function syncInstall() {
      const installed = installedThisSession || isStandalone();
      get('installFamily').classList.toggle('hidden', installed);
      get('installFamilyAccessBox').classList.toggle('hidden', installed || !!token);
      if (installed) installHelp('O Portal da Família já está instalado neste aparelho.');
    }
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; syncInstall(); });
    window.addEventListener('appinstalled', () => { installPrompt = null; installedThisSession = true; syncInstall(); installHelp('Portal instalado. Agora toque em “Ativar notificações neste aparelho” se quiser receber avisos da escola.'); });
    window.matchMedia('(display-mode: standalone)').addEventListener?.('change', syncInstall);
    get('installFamily').onclick = async () => {
      if (installPrompt) {
        const prompt = installPrompt; installPrompt = null;
        try {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice?.outcome === 'accepted') return installHelp('Instalação aceita. Abra o Portal pelo ícone na tela inicial e ative as notificações, se desejar.');
        } catch { /* Exibe o caminho manual abaixo. */ }
        if (isStandalone()) return syncInstall();
      }
      installHelp(isAppleMobile()
        ? 'No iPhone ou iPad, abra esta página no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”. Depois abra o Portal pelo novo ícone.'
        : 'No menu do navegador (⋮ ou ⋯), escolha “Instalar aplicativo” ou “Adicionar à tela inicial”. Se a opção não aparecer, abra esta página no Chrome ou Edge.');
    };
    get('installFamilyAccess').onclick = () => get('installFamily').onclick();
    async function syncPushStatus() {
      const userId = familyUserId;
      if (!userId) return;
      if (isAppleMobile() && !isStandalone()) return pushStatus('No iPhone ou iPad, primeiro adicione o Portal à Tela de Início e abra-o pelo ícone. Depois ative as notificações aqui.');
      if (!supportsPush()) return pushStatus('Este navegador não permite notificações neste aparelho. As comunicações continuam disponíveis aqui no Portal.');
      if (Notification.permission === 'denied') return pushStatus('As notificações estão bloqueadas. Abra as configurações deste site no aparelho para permitir e tente novamente.');
      if (Notification.permission !== 'granted') return pushStatus('Toque no botão e escolha “Permitir” quando o aparelho perguntar. Você pode mudar essa escolha nas configurações.');
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription || familyUserId !== userId) return pushStatus('A permissão está concedida. Toque em “Ativar notificações neste aparelho” para concluir.');
        const { data, error: queryError } = await db.from('push_subscriptions').select('id').eq('user_id', userId).eq('endpoint', subscription.endpoint).eq('enabled', true).maybeSingle();
        if (familyUserId !== userId) return;
        pushStatus(!queryError && data ? 'Notificações ativadas neste aparelho para sua conta.' : 'A permissão está concedida. Toque em “Ativar notificações neste aparelho” para concluir.');
      } catch { pushStatus('Não foi possível verificar este aparelho. Toque em “Ativar notificações” para tentar novamente.'); }
    }
    get('enableFamilyPush').onclick = async event => {
      const button = event.currentTarget;
      const userId = familyUserId;
      const generation = sessionGeneration;
      if (!userId) return;
      if (isAppleMobile() && !isStandalone()) return syncPushStatus();
      if (!supportsPush()) return syncPushStatus();
      if (Notification.permission === 'denied') return syncPushStatus();
      if (!config.vapidPublicKey || config.vapidPublicKey.startsWith('__')) return pushStatus('As notificações ainda não estão configuradas. Consulte a escola.');
      // O pedido nativo precisa ocorrer diretamente após o toque do responsável.
      const permissionRequest = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
      button.disabled = true;
      pushStatus('Aguardando a escolha de permissão do aparelho…');
      try {
        if (await permissionRequest !== 'granted') return pushStatus('Você não autorizou notificações. Pode ativá-las depois; as comunicações continuam no Portal.');
        if (familyUserId !== userId || sessionGeneration !== generation) return;
        const registration = await navigator.serviceWorker.register('./sw.js', { scope:'./' });
        const ready = registration.active ? registration : await navigator.serviceWorker.ready;
        if (familyUserId !== userId || sessionGeneration !== generation) return;
        let subscription = await ready.pushManager.getSubscription();
        subscription ||= await ready.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:vapidKey() });
        if (familyUserId !== userId || sessionGeneration !== generation) return;
        const details = subscription.toJSON();
        const claim = db.rpc('claim_push_subscription', { p_endpoint:details.endpoint, p_p256dh:details.keys?.p256dh, p_auth_key:details.keys?.auth, p_user_agent:navigator.userAgent });
        claimInFlight = claim.then(() => {}, () => {});
        const { error: claimError } = await claim;
        if (claimError) throw claimError;
        if (familyUserId === userId && sessionGeneration === generation) pushStatus('Pronto. Este aparelho receberá avisos das comunicações publicadas pela escola para seus filhos autorizados.');
      } catch { if (familyUserId === userId && sessionGeneration === generation) pushStatus('Não foi possível ativar as notificações agora. Tente novamente; as comunicações continuam no Portal.'); }
      finally { button.disabled = false; }
    };
    async function unlinkPushOnSignOut(userId) {
      if (!userId || !supportsPush()) return;
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        const { error: removeError } = await db.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint);
        if (!removeError) await subscription.unsubscribe();
      } catch { /* A sessão será encerrada mesmo se o aparelho estiver offline. */ }
    }
    syncInstall();
    const error = (id, message) => { const box = get(id); box.textContent = message; box.classList.toggle('hidden', !message); };
    const phone = value => { const clean = value.replace(/[\s()\-]/g, ''); if (!/^\+[1-9][0-9]{7,14}$/.test(clean)) throw new Error('Use o celular com DDI, por exemplo +5562999999999.'); return clean; };
    const familyEmail = value => `familia-${phone(value).slice(1)}@sistemacarometro.com.br`;
    const busy = async (button, work, errorId = 'accessError') => { button.disabled = true; try { await work(); } catch (caught) { error(errorId, caught.message || 'Não foi possível continuar.'); } finally { button.disabled = false; } };
    function stopLive() {
      if (livePoll) clearInterval(livePoll);
      livePoll = null;
      if (liveChannel && typeof db.removeChannel === 'function') void db.removeChannel(liveChannel);
      liveChannel = null;
    }
    async function refreshPortalFeed(fromNotice = false) {
      if (!familyUserId || document.visibilityState === 'hidden' || refreshBusy) return;
      refreshBusy = true;
      try {
        if (fromNotice) get('portalLiveStatus').textContent = 'Nova comunicação da escola. Confira seus estudantes.';
        if (selectedLink) {
          const changed = await openTimeline(selectedLink);
          if (changed) {
            get('portalLiveStatus').textContent = 'Há uma nova comunicação da escola para este estudante.';
            if (historyCategory) await loadHistory(false);
          }
        } else if (fromNotice) {
          get('portalLiveStatus').textContent = 'Há uma nova comunicação da escola. Escolha o estudante para ler.';
        }
      } finally { refreshBusy = false; }
    }
    function startLive(userId) {
      stopLive();
      if (typeof db.channel === 'function') {
        liveChannel = db.channel(`family-notices-${userId}`)
          .on('postgres_changes', { event:'INSERT',schema:'public',table:'user_notifications',filter:`recipient_id=eq.${userId}` }, payload => {
            if (payload.new?.target_type === 'family_message') void refreshPortalFeed(true).catch(() => {});
          }).subscribe();
      }
      // Recupera avisos após suspensão do navegador ou queda da conexão Realtime.
      if (typeof setInterval === 'function') livePoll = setInterval(() => { if (selectedLink) void refreshPortalFeed().catch(() => {}); }, 15000);
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'hidden') void refreshPortalFeed().catch(() => {}); });
    window.addEventListener('focus', () => { if (selectedLink) void refreshPortalFeed().catch(() => {}); });
    navigator.serviceWorker?.addEventListener?.('message', event => {
      if (event.data?.type === 'family-notice') void refreshPortalFeed(true).catch(() => {});
    });
    async function loadPortal() {
      const { data: userData, error: authError } = await db.auth.getUser();
      if (authError || !userData?.user) return;
      const { data, error: listError } = await db.rpc('family_my_students');
      if (listError) throw listError;
      links = data || [];
      const available = await db.rpc('family_digital_cards_available');
      digitalEnabledSchools = new Set((available.error ? [] : available.data || []).map(row => row.school_id));
      stopLive();
      familyUserId = userData.user.id;
      sessionGeneration++;
      get('access').classList.add('hidden');
      get('portal').classList.remove('hidden');
      void syncPushStatus();
      error('portalError','');
      get('students').innerHTML = links.length ? links.map(link => `<button class="student-card" type="button" data-link="${link.link_id}"><strong>${esc(link.student_name)}</strong><small>${esc(link.school_name)} · ${esc(link.class_name)}</small></button>`).join('') : '<div class="empty">Nenhum estudante autorizado para este celular. Consulte a escola caso tenha recebido um convite.</div>';
      if (selectedLink && links.some(link => link.link_id === selectedLink)) await openTimeline(selectedLink);
      else get('timeline').classList.add('hidden');
      startLive(familyUserId);
    }
    async function acceptPendingInvite() {
      if (!token) return;
      const { error: acceptError } = await db.rpc('family_accept_invitation', { p_token:token });
      if (acceptError) throw acceptError;
      history.replaceState(null,'',location.pathname);
    }
    async function openTimeline(linkId) {
      const link = links.find(row => row.link_id === linkId);
      if (!link) return;
      const wasSelected = selectedLink === linkId;
      selectedLink = linkId;
      get('openDigitalCard').classList.toggle('hidden', !digitalEnabledSchools.has(link.school_id));
      if (!wasSelected) {
        lastFeedSignature = '';
        historyCategory = null;
        historyRequest++;
        get('familyHistory').classList.add('hidden');
        for (const id of ['showOccurrenceHistory','showEntryHistory']) get(id).setAttribute('aria-pressed','false');
      }
      const generation = sessionGeneration;
      const { data, error: feedError } = await db.rpc('family_feed', { p_link_id:linkId });
      if (familyUserId === null || generation !== sessionGeneration || selectedLink !== linkId) return false;
      if (feedError) { error('portalError',feedError.message); return; }
      // Leitura e ciência mudam em segundo plano; não feche o cartão aberto por isso.
      const signature = `${linkId}:${JSON.stringify((data || []).map(row => [row.message_id,row.published_at,row.title,row.body,row.category]))}`;
      if (signature === lastFeedSignature) return false;
      lastFeedSignature = signature;
      get('schoolName').textContent = link.school_name;
      get('studentName').textContent = link.student_name;
      get('className').textContent = link.class_name || '';
      get('timeline').classList.remove('hidden');
      get('messages').innerHTML = data?.length ? data.map(message => `<article class="message" data-message="${esc(message.message_id)}" data-viewed="${message.viewed_at ? 'true' : 'false'}"><header><h3>${esc(message.title)}</h3><time>${new Intl.DateTimeFormat('pt-BR',{ dateStyle:'medium',timeStyle:'short' }).format(new Date(message.published_at))}</time></header><small>${message.acknowledged_at ? 'Ciência confirmada' : message.viewed_at ? 'Visualizada' : 'Ainda não visualizada'}</small><div><button class="outline" type="button" data-open aria-expanded="false">Ver comunicação</button></div><div class="message-detail hidden"><p class="${message.category === 'entry' ? 'entry-highlight' : ''}">${message.category === 'entry' ? `<strong>${esc(message.body)}</strong>` : esc(message.body)}</p><footer>${message.acknowledged_at ? 'Ciência confirmada' : 'Ciência ainda não confirmada'}</footer>${message.acknowledged_at ? '' : '<button class="primary" type="button" data-acknowledge>Confirmar ciência</button>'}</div></article>`).join('') : '<div class="empty">Ainda não há comunicações para este estudante.</div>';
      return true;
    }
    const displayDate = value => value ? `${value.slice(8,10)}/${value.slice(5,7)}/${value.slice(0,4)}` : '';
    const entryMoment = value => new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)).replace(',',' às');
    async function loadHistory(append = false) {
      if (!selectedLink || !historyCategory) return;
      const request = ++historyRequest;
      const linkId = selectedLink;
      const category = historyCategory;
      const offset = append ? historyOffset : 0;
      get('historyStatus').textContent = 'Buscando histórico…';
      get('moreHistory').disabled = true;
      const { data, error: historyError } = await db.rpc('family_history', {
        p_link_id:linkId,p_category:category,p_date:get('historyDate').value || null,
        p_teacher:category === 'occurrence' ? get('historyTeacher').value.trim() || null : null,
        p_limit:historyPageSize,p_offset:offset,
      });
      if (request !== historyRequest || selectedLink !== linkId || historyCategory !== category) return;
      get('moreHistory').disabled = false;
      if (historyError) { get('historyStatus').textContent = 'Não foi possível consultar o histórico. Tente novamente.'; return; }
      const rows = data || [];
      const markup = rows.map(row => category === 'entry'
        ? `<article class="history-result"><h4>Entrada na escola</h4><p class="history-entry"><strong>Entrada registrada em ${esc(entryMoment(row.event_at))}.</strong></p></article>`
        : `<article class="history-result"><h4>${esc(row.title)}</h4><small>Data da ocorrência: ${esc(displayDate(row.event_date))} · Professor responsável: ${esc(row.professor_name || 'Não informado')}</small><p>${esc(row.body)}</p></article>`).join('');
      if (append) get('historyResults').insertAdjacentHTML('beforeend', markup);
      else get('historyResults').innerHTML = markup || '<div class="empty">Nenhum registro publicado para estes filtros.</div>';
      historyOffset = offset + rows.length;
      get('moreHistory').classList.toggle('hidden', rows.length < historyPageSize);
      get('historyStatus').textContent = rows.length ? `${historyOffset} registro(s) exibido(s).` : '';
    }
    async function showHistory(category) {
      historyCategory = category;
      historyRequest++;
      historyOffset = 0;
      get('historyDate').value = '';
      get('historyTeacher').value = '';
      get('historyTeacherRow').classList.toggle('hidden', category !== 'occurrence');
      get('familyHistoryTitle').textContent = category === 'entry' ? 'Histórico de entradas na escola' : 'Histórico de ocorrências compartilhadas pela escola';
      get('familyHistory').classList.remove('hidden');
      get('showOccurrenceHistory').setAttribute('aria-pressed',String(category === 'occurrence'));
      get('showEntryHistory').setAttribute('aria-pressed',String(category === 'entry'));
      await loadHistory();
    }
    get('showOccurrenceHistory').onclick = () => showHistory('occurrence');
    get('showEntryHistory').onclick = () => showHistory('entry');
    get('historyFilters').onsubmit = event => { event.preventDefault(); return loadHistory(); };
    get('clearHistoryFilters').onclick = () => { get('historyDate').value = ''; get('historyTeacher').value = ''; return loadHistory(); };
    get('moreHistory').onclick = () => loadHistory(true);
    function closeDigitalViewer() {
      digitalRequest++;
      digitalCanvas = null;
      digitalQrCanvas = null;
      digitalCardFile = null;
      digitalCardName = '';
      get('digitalCardImage').removeAttribute('src');
      get('digitalCardViewer').classList.add('hidden');
      if (document.fullscreenElement === get('digitalCardViewer')) void document.exitFullscreen?.().catch(() => {});
      try { screen.orientation?.unlock?.(); } catch { /* O navegador pode não oferecer bloqueio de orientação. */ }
    }
    get('closeDigitalCard').onclick = closeDigitalViewer;
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !get('digitalCardViewer').classList.contains('hidden')) closeDigitalViewer(); });
    async function loadCardPhoto(path) {
      if (!path) return null;
      const { data, error: photoError } = await db.storage.from('student-photos').download(path);
      if (photoError || !data) throw new Error('A foto do aluno não está disponível. Peça à escola para conferir o cadastro.');
      const url = URL.createObjectURL(data);
      try {
        return await new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Não foi possível abrir a foto do aluno.'));
          image.src = url;
        });
      } finally { URL.revokeObjectURL(url); }
    }
    get('openDigitalCard').onclick = async () => {
      const linkId = selectedLink;
      if (!linkId || !familyUserId) return;
      const request = ++digitalRequest;
      const generation = sessionGeneration;
      const viewer = get('digitalCardViewer');
      digitalCanvas = null; digitalQrCanvas = null; digitalCardFile = null;
      viewer.classList.remove('hidden');
      get('digitalCardTitle').textContent = 'Carteirinha digital';
      get('digitalCardImage').classList.add('hidden');
      for (const id of ['shareDigitalCard','saveDigitalCard','showDigitalQr']) get(id).classList.add('hidden');
      get('digitalCardStatus').textContent = 'Preparando a carteirinha…';
      // O pedido de tela cheia precisa ocorrer diretamente no toque do responsável.
      if (viewer.requestFullscreen) void viewer.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
      try {
        const { data, error: cardError } = await db.rpc('family_get_digital_card', { p_link_id:linkId });
        if (cardError || !data?.[0]) throw new Error(cardError?.message || 'A escola ainda não liberou a carteirinha deste aluno.');
        const card = data[0];
        if (!window.FamilyDigitalCard || typeof window.qrcode !== 'function') throw new Error('Não foi possível preparar a imagem da carteirinha.');
        const photo = await loadCardPhoto(card.photo_path);
        if (request !== digitalRequest || generation !== sessionGeneration || selectedLink !== linkId) return;
        digitalCanvas = window.FamilyDigitalCard.render(card, photo, window.qrcode);
        digitalQrCanvas = window.FamilyDigitalCard.renderQr(card.qr_token, window.qrcode);
        digitalCardName = card.student_name;
        const blob = await new Promise((resolve,reject) => digitalCanvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível gerar a imagem.')),'image/png'));
        if (request !== digitalRequest || generation !== sessionGeneration || selectedLink !== linkId) return;
        digitalCardFile = new File([blob], `carteirinha-${digitalCardName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}.png`, { type:'image/png' });
        digitalShowingQr = false;
        get('digitalCardImage').src = digitalCanvas.toDataURL('image/png');
        get('digitalCardImage').classList.remove('hidden');
        for (const id of ['shareDigitalCard','saveDigitalCard','showDigitalQr']) get(id).classList.remove('hidden');
        get('showDigitalQr').textContent = 'Ampliar QR Code';
        get('digitalCardTitle').textContent = `Carteirinha de ${card.student_name}`;
        get('digitalCardStatus').textContent = 'Frente e verso lado a lado. Mostre o QR Code à escola.';
      } catch (caught) {
        if (request === digitalRequest) get('digitalCardStatus').textContent = caught.message || 'Não foi possível abrir a carteirinha.';
      }
    };
    get('showDigitalQr').onclick = () => {
      if (!digitalCanvas || !digitalQrCanvas) return;
      digitalShowingQr = !digitalShowingQr;
      get('digitalCardImage').src = (digitalShowingQr ? digitalQrCanvas : digitalCanvas).toDataURL('image/png');
      get('showDigitalQr').textContent = digitalShowingQr ? 'Mostrar frente e verso' : 'Ampliar QR Code';
      get('digitalCardStatus').textContent = digitalShowingQr ? 'QR Code ampliado para leitura na entrada.' : 'Frente e verso lado a lado.';
    };
    const cardFile = () => {
      if (!digitalCardFile) throw new Error('Abra a carteirinha primeiro.');
      return digitalCardFile;
    };
    function downloadCard(file) {
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = file.name;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    get('shareDigitalCard').onclick = async event => {
      const button = event.currentTarget; button.disabled = true;
      try {
        const file = cardFile();
        if (navigator.share && navigator.canShare?.({ files:[file] })) {
          await navigator.share({ files:[file],title:'Carteirinha escolar' });
          get('digitalCardStatus').textContent = 'Carteirinha compartilhada pelo aplicativo escolhido.';
        } else {
          downloadCard(file);
          get('digitalCardStatus').textContent = 'Imagem salva. Compartilhe-a pelo WhatsApp ou pela galeria do aparelho.';
        }
      } catch (caught) { if (caught.name !== 'AbortError') get('digitalCardStatus').textContent = caught.message || 'Não foi possível compartilhar.'; }
      finally { button.disabled = false; }
    };
    get('saveDigitalCard').onclick = async event => {
      const button = event.currentTarget; button.disabled = true;
      try { downloadCard(cardFile()); get('digitalCardStatus').textContent = 'Imagem da carteirinha salva neste aparelho.'; }
      catch (caught) { get('digitalCardStatus').textContent = caught.message || 'Não foi possível salvar a imagem.'; }
      finally { button.disabled = false; }
    };
    get('students').onclick = event => { const card = event.target.closest('[data-link]'); if (card) { get('portalLiveStatus').textContent = ''; return openTimeline(card.dataset.link); } };
    get('backToStudents').onclick = () => { selectedLink = null; lastFeedSignature = ''; historyCategory = null; historyRequest++; get('timeline').classList.add('hidden'); get('portalLiveStatus').textContent = ''; };
    get('messages').onclick = async event => {
      const opener = event.target.closest('[data-open]');
      if (opener && selectedLink) {
        const article = opener.closest('[data-message]');
        const detail = article.querySelector('.message-detail');
        const opening = detail.classList.contains('hidden');
        if (opening && article.dataset.viewed !== 'true') {
          opener.disabled = true;
          const { error: viewError } = await db.rpc('family_record_receipt', { p_link_id:selectedLink,p_message_id:article.dataset.message,p_acknowledge:false });
          opener.disabled = false;
          if (viewError) { error('portalError',viewError.message); return; }
          article.dataset.viewed = 'true';
          article.querySelector('small').textContent = 'Visualizada';
        }
        detail.classList.toggle('hidden', !opening);
        opener.textContent = opening ? 'Ocultar comunicação' : 'Ver comunicação';
        opener.setAttribute('aria-expanded', String(opening));
        return;
      }
      const button = event.target.closest('[data-acknowledge]');
      if (!button || !selectedLink) return;
      const article = button.closest('[data-message]');
      button.disabled = true;
      const { error: receiptError } = await db.rpc('family_record_receipt', { p_link_id:selectedLink,p_message_id:article.dataset.message,p_acknowledge:true });
      if (receiptError) { error('portalError',receiptError.message); button.disabled = false; return; }
      article.querySelector('footer').textContent = 'Ciência confirmada';
      article.querySelector('small').textContent = 'Ciência confirmada';
      button.remove();
    };
    get('signOut').onclick = async () => { const leavingUser = familyUserId; familyUserId = null; sessionGeneration++; stopLive(); historyRequest++; closeDigitalViewer(); await claimInFlight; await unlinkPushOnSignOut(leavingUser); await db.auth.signOut(); selectedLink = null; links = []; digitalEnabledSchools.clear(); get('portal').classList.add('hidden'); get('access').classList.remove('hidden'); };
    get('passwordForm').onsubmit = event => {
      event.preventDefault(); error('accessError','');
      busy(event.submitter, async () => {
        const { error: loginError } = await db.auth.signInWithPassword({ email:familyEmail(get('phone').value),password:get('password').value });
        if (loginError) throw loginError;
        await acceptPendingInvite();
        await loadPortal();
      });
    };
    function showFirstAccess() {
      get('passwordForm').classList.add('hidden');
      get('firstAccessForm').classList.remove('hidden');
      get('invitePhone').value = get('phone').value;
      error('accessError','');
    }
    async function previewInvitation(invitedPhone) {
      if (!token) throw new Error('Abra o convite individual apresentado pela escola.');
      if (previewedPhone === invitedPhone) return;
      const { data, error: previewError } = await db.functions.invoke('family-activate', {
        body: { action:'preview', token, phone:invitedPhone },
      });
      if (previewError || !Array.isArray(data?.students) || !data.students.length) {
        const response = await previewError?.context?.json?.().catch(() => null);
        throw new Error(response?.error || 'Não foi possível conferir este convite. Confira o celular com a escola.');
      }
      get('inviteChildren').innerHTML = `<strong>Filhos autorizados neste convite</strong><ul>${data.students.map(student => `<li>${esc(student.name)} · Turma ${esc(student.class_name || 'não informada')}</li>`).join('')}</ul>`;
      get('inviteChildren').classList.remove('hidden');
      previewedPhone = invitedPhone;
    }
    get('invitePhone').oninput = () => { previewedPhone = null; get('inviteChildren').classList.add('hidden'); };
    get('checkInvitation').onclick = event => busy(event.currentTarget, async () => {
      await previewInvitation(phone(get('invitePhone').value));
      error('accessError','');
    });
    get('firstAccess').onclick = () => { if (!token) return error('accessError','Abra o convite individual enviado pela escola para fazer o primeiro acesso.'); showFirstAccess(); };
    get('backToLogin').onclick = () => { get('firstAccessForm').classList.add('hidden'); get('passwordForm').classList.remove('hidden'); error('accessError',''); };
    get('firstAccessForm').onsubmit = event => {
      event.preventDefault(); error('accessError','');
      busy(event.submitter, async () => {
        if (!token) throw new Error('Abra o convite individual enviado pela escola.');
        const invitedPhone = phone(get('invitePhone').value);
        await previewInvitation(invitedPhone);
        const password = get('invitePassword').value;
        const { data, error: activationError } = await db.functions.invoke('family-activate', {
          body: { token, phone:invitedPhone, password },
        });
        if (activationError || !data) {
          const response = await activationError?.context?.json?.().catch(() => null);
          throw new Error(response?.error || 'Não foi possível criar o acesso.');
        }
        if (data.existing) {
          const { error: existingLoginError } = await db.auth.signInWithPassword({ email:familyEmail(invitedPhone), password });
          if (!existingLoginError) {
            get('invitePassword').value = '';
            await acceptPendingInvite();
            await loadPortal();
            return;
          }
          get('phone').value = invitedPhone;
          get('firstAccessForm').classList.add('hidden');
          get('passwordForm').classList.remove('hidden');
          error('accessError','Este celular já tem acesso. Entre com a senha que você usa no Portal da Família para aceitar o convite.');
          return;
        }
        if (!data.created) throw new Error(data.error || 'Não foi possível criar o acesso.');
        const { error: loginError } = await db.auth.signInWithPassword({ email:familyEmail(invitedPhone),password });
        if (loginError) throw new Error('Acesso criado. Entre com o celular e a senha que você acabou de definir.');
        await acceptPendingInvite();
        get('invitePassword').value = '';
        await loadPortal();
      });
    };
    get('changePasswordForm').onsubmit = event => {
      event.preventDefault(); error('portalError','');
      busy(event.submitter, async () => {
        const { error: updateError } = await db.auth.updateUser({ password:get('changedPassword').value, current_password:get('currentPassword').value });
        if (updateError) throw updateError;
        get('changePasswordForm').reset();
        error('portalError','Senha alterada.');
      }, 'portalError');
    };
    if (token) showFirstAccess();
    try {
      const { data } = await db.auth.getSession();
      if (data.session) { await acceptPendingInvite(); await loadPortal(); }
    } catch (caught) { error('accessError',caught.message || 'Não foi possível abrir o portal.'); }
  });
})();
