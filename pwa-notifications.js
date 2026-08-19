document.addEventListener('DOMContentLoaded',()=>{
  const VAPID_PUBLIC_KEY='BFx6svQXDRL6SJZmyYf2WKX2YhqBTHm8cDIXg73Kut19_pU3YATCdu-NBWyHhOA-o-I9OLy9H4koPbrM5tGVHdU';
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
  // Ordem deliberada: 1) remove no banco, só a própria linha (endpoint +
  // user_id, redundante com a RLS que já exige user_id=auth.uid() — nunca
  // consegue tocar assinatura de terceiros); 2) só depois destrói a
  // assinatura no navegador. Cada etapa tem seu próprio try/catch: uma
  // falha isolada em qualquer uma delas não impede a outra nem bloqueia o
  // logout em si (quem chama isto sempre segue para signOut() na sequência).
  // Não recria nada para o próximo usuário — quem entrar depois vê o botão
  // "Ativar notificações" normalmente e decide ativar por conta própria.
  async function disablePush(){
    try{
      const registration=await register();
      const subscription=await registration?.pushManager.getSubscription();
      if(!subscription)return;
      const user=await signedIn();
      if(user){
        try{
          // O Supabase JS normalmente devolve o erro em { error } em vez de
          // lançar exceção — capturamos explicitamente aqui. É limpeza
          // best-effort: uma falha não deve impedir o unsubscribe() nem o
          // logout, que seguem de qualquer forma.
          const { error: deleteError } = await db.from('push_subscriptions').delete().eq('endpoint',subscription.endpoint).eq('user_id',user.id);
          if(deleteError){/* ignorado de propósito: ver comentário acima */}
        }catch{}
      }
      try{await subscription.unsubscribe();}catch{}
    }catch{}
  }
  window.disableCarometroPush=disablePush;
  async function activatePush(){try{if(VAPID_PUBLIC_KEY.startsWith('__')){toast('O envio push ainda aguarda a chave segura do servidor.');return;}const permission=await Notification.requestPermission();if(permission!=='granted'){toast('As notificações não foram autorizadas.');return;}const registration=await register();let subscription=await registration.pushManager.getSubscription();subscription||=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToUint8(VAPID_PUBLIC_KEY)});await saveSubscription(subscription);pushButton.textContent='Notificações ativadas';pushButton.disabled=true;toast('Este dispositivo receberá notificações do CARÔMETRO.');}catch(error){toast(`Não foi possível ativar: ${error.message}`);}}
  async function syncButtons(){const user=await signedIn();if(!user||document.getElementById('app').classList.contains('hidden'))return;const registration=await register();pushButton.classList.toggle('hidden',!registration);if(registration&&Notification.permission==='granted'){const existing=await registration.pushManager.getSubscription();if(existing){await saveSubscription(existing).catch(()=>{});pushButton.textContent='Notificações ativadas';pushButton.disabled=true;}}if(notificationChannel)await db.removeChannel(notificationChannel);notificationChannel=db.channel(`push-ui-${user.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'user_notifications',filter:`recipient_id=eq.${user.id}`},payload=>{toast(payload.new.title);}).subscribe();}
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;pwaButton.classList.remove('hidden');});
  window.addEventListener('appinstalled',()=>{pwaButton.classList.add('hidden');toast('CARÔMETRO instalado.');});
  if(isIos()&&!isStandalone()){pwaButton.classList.remove('hidden');pwaButton.textContent='Como instalar';}
  pwaButton.onclick=async()=>{if(isIos()&&!installPrompt){alert('No iPhone/iPad: toque em Compartilhar e depois em Adicionar à Tela de Início. Abra o CARÔMETRO instalado para ativar as notificações.');return;}if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;pwaButton.classList.add('hidden');};pushButton.onclick=activatePush;
  new MutationObserver(syncButtons).observe(document.getElementById('app'),{attributes:true,attributeFilter:['class']});
});
