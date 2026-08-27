document.addEventListener('DOMContentLoaded',()=>{
  const VAPID_PUBLIC_KEY=window.CAROMETRO_RUNTIME_CONFIG?.vapidPublicKey||'__VAPID_PUBLIC_KEY_NOT_CONFIGURED__';
  let installPrompt=null,notificationChannel=null;
  const pwaButton=document.createElement('button');pwaButton.id='installCarometro';pwaButton.className='btn secondary hidden';pwaButton.textContent='Instalar aplicativo';document.querySelector('.top-actions')?.prepend(pwaButton);
  const pushButton=document.createElement('button');pushButton.id='enableCarometroPush';pushButton.className='btn secondary hidden';pushButton.textContent='Ativar notificações';document.querySelector('.top-actions')?.prepend(pushButton);
  const base64ToUint8=value=>{const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));};
  const supported=()=>location.protocol==='https:'&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
  const isIos=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  async function register(){if(!supported())return null;return navigator.serviceWorker.register('./sw.js',{scope:'./'});}
  async function signedIn(){return (await db.auth.getUser()).data.user;}
  async function saveSubscription(subscription){const user=await signedIn();if(!user)return;const json=subscription.toJSON(),keys=json.keys||{};const {error}=await db.rpc('claim_push_subscription',{p_endpoint:json.endpoint,p_p256dh:keys.p256dh,p_auth_key:keys.auth,p_user_agent:navigator.userAgent});if(error)throw error;}
  // Usado no logout explícito, enquanto o usuário ainda está autenticado.
  // Remove só o VÍNCULO no banco (a linha própria, endpoint + user_id,
  // redundante com a RLS que já exige user_id=auth.uid() — nunca consegue
  // tocar assinatura de terceiros) — nunca chama unsubscribe(). A
  // PushSubscription real do navegador permanece válida de propósito: é
  // isso que permite ao próximo login (mesmo usuário ou outro, no mesmo
  // aparelho) reivindicá-la de novo sem exigir um novo clique/permissão. É
  // exatamente esse "sem vínculo no banco entre o logout e o próximo login"
  // que impede notificações de A chegarem a B nesse intervalo.
  async function unclaimOnLogout(){
    try{
      const registration=await register();
      const subscription=await registration?.pushManager.getSubscription();
      if(!subscription)return;
      const user=await signedIn();
      if(!user)return;
      try{
        // O Supabase JS normalmente devolve o erro em { error } em vez de
        // lançar exceção — capturamos explicitamente aqui. Limpeza
        // best-effort: uma falha não deve bloquear o logout, que segue de
        // qualquer forma.
        const { error: deleteError } = await db.from('push_subscriptions').delete().eq('endpoint',subscription.endpoint).eq('user_id',user.id);
        if(deleteError){/* ignorado de propósito: ver comentário acima */}
      }catch{}
    }catch{}
  }
  window.disableCarometroPush=unclaimOnLogout;

  async function clearNotificationChannel(){
    if(notificationChannel){
      await db.removeChannel(notificationChannel);
      notificationChannel=null;
    }
    pushButton.classList.add('hidden');
    pushButton.disabled=false;
    pushButton.textContent='Ativar notificações';
    pushButton.dataset.active='false';
  }
  window.clearCarometroNotificationChannel=clearNotificationChannel;

  // Usado só pelo clique explícito em "Desativar notificações" (ação
  // voluntária do usuário autenticado). Único caminho que ainda destrói a
  // PushSubscription real (unsubscribe()) — mesma ordem de antes: 1) remove
  // o vínculo no banco; 2) só depois destrói no navegador.
  async function deactivatePush(){
    try{
      const registration=await register();
      const subscription=await registration?.pushManager.getSubscription();
      if(subscription){
        const user=await signedIn();
        if(user){
          try{
            const { error: deleteError } = await db.from('push_subscriptions').delete().eq('endpoint',subscription.endpoint).eq('user_id',user.id);
            if(deleteError){}
          }catch{}
        }
        try{await subscription.unsubscribe();}catch{}
      }
    }catch{}
    pushButton.textContent='Ativar notificações';
    pushButton.dataset.active='false';
    toast('Notificações desativadas neste dispositivo.');
  }
  async function activatePush(){try{if(VAPID_PUBLIC_KEY.startsWith('__')){toast('O envio push ainda aguarda a chave segura do servidor.');return;}const permission=await Notification.requestPermission();if(permission!=='granted'){toast('As notificações não foram autorizadas.');return;}const registration=await register();let subscription=await registration.pushManager.getSubscription();subscription||=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToUint8(VAPID_PUBLIC_KEY)});await saveSubscription(subscription);pushButton.textContent='Desativar notificações';pushButton.dataset.active='true';toast('Este dispositivo receberá notificações do CARÔMETRO.');}catch(error){toast(`Não foi possível ativar: ${error.message}`);}}
  async function syncButtons(){const user=await signedIn(),schoolId=window.getActiveSchoolId?.();if(!user||!schoolId||document.getElementById('app').classList.contains('hidden'))return;const registration=await register();pushButton.classList.toggle('hidden',!registration);if(registration&&Notification.permission==='granted'){let existing=await registration.pushManager.getSubscription();
    // Permissão já concedida mas a assinatura sumiu (ex.: Service Worker
    // atualizado, dado do site parcialmente limpo) — repara automaticamente
    // aqui, na abertura autenticada do app, sem nunca pedir permissão de
    // novo (já é 'granted') e sem depender de nenhum mecanismo do Service
    // Worker (que não tem a sessão do Supabase para reivindicar com segurança).
    if(!existing&&!VAPID_PUBLIC_KEY.startsWith('__')){try{existing=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToUint8(VAPID_PUBLIC_KEY)});}catch{}}
    if(existing){
      // Só marca como ativado depois da reivindicação no banco ter sucesso
      // de verdade — nunca "mentir" visualmente. Falha aqui é silenciosa de
      // propósito (sem toast): syncButtons roda automaticamente a cada
      // abertura/renderização do app, e um toast repetitivo a cada chamada
      // seria ruído. A subscription do navegador nunca é tocada nesta
      // falha (sem unsubscribe(), sem nova tentativa em loop) — ela
      // continua disponível para a próxima chamada de syncButtons tentar
      // de novo, ou para o usuário tentar manualmente pelo botão.
      try{
        await saveSubscription(existing);
        pushButton.textContent='Desativar notificações';
        pushButton.dataset.active='true';
      }catch{
        pushButton.textContent='Ativar notificações';
        pushButton.dataset.active='false';
      }
    }}if(notificationChannel)await db.removeChannel(notificationChannel);notificationChannel=db.channel(`push-ui-${user.id}-${schoolId}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'user_notifications',filter:`school_id=eq.${schoolId}`},payload=>{if(payload.new.recipient_id===user.id)toast(payload.new.title);}).subscribe();}
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;pwaButton.classList.remove('hidden');});
  window.addEventListener('appinstalled',()=>{pwaButton.classList.add('hidden');toast('CARÔMETRO instalado.');});
  if(isIos()&&!isStandalone()){pwaButton.classList.remove('hidden');pwaButton.textContent='Como instalar';}
  pwaButton.onclick=async()=>{if(isIos()&&!installPrompt){alert('No iPhone/iPad: toque em Compartilhar e depois em Adicionar à Tela de Início. Abra o CARÔMETRO instalado para ativar as notificações.');return;}if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;pwaButton.classList.add('hidden');};pushButton.onclick=()=>(pushButton.dataset.active==='true'?deactivatePush:activatePush)();
  new MutationObserver(syncButtons).observe(document.getElementById('app'),{attributes:true,attributeFilter:['class']});
  db.auth.onAuthStateChange((_event,session)=>{if(!session)void clearNotificationChannel().catch(()=>{});});
});
