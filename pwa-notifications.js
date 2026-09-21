document.addEventListener('DOMContentLoaded',()=>{
  const VAPID_PUBLIC_KEY=window.CAROMETRO_RUNTIME_CONFIG?.vapidPublicKey||'__VAPID_PUBLIC_KEY_NOT_CONFIGURED__';
  let installPrompt=null;
  const pwaButton=document.createElement('button');pwaButton.id='installCarometro';pwaButton.className='btn secondary hidden';pwaButton.textContent='Instalar aplicativo';document.querySelector('.top-actions')?.prepend(pwaButton);
  const pushButton=document.createElement('button');pushButton.id='enableCarometroPush';pushButton.className='btn secondary hidden';pushButton.textContent='Ativar notificações';document.querySelector('.top-actions')?.prepend(pushButton);
  const onboarding=document.createElement('section');onboarding.id='pushOnboarding';onboarding.className='panel hidden';
  onboarding.style.cssText='padding:16px;margin:0 0 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
  onboarding.innerHTML='<div style="flex:1;min-width:200px"><b>Receba os avisos da sua escola</b><p id="pushOnboardingText" style="margin:6px 0 0">Ative as notificações neste dispositivo para acompanhar as atualizações autorizadas para sua conta.</p></div><button type="button" id="startPushOnboarding" class="btn primary">Ativar notificações</button><button type="button" id="dismissPushOnboarding" class="btn secondary">Agora não</button>';
  document.querySelector('.top')?.after(onboarding);
  const startButton=document.getElementById('startPushOnboarding');
  const base64ToUint8=value=>{const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));};
  const supported=()=>window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
  const canUseNotifications=()=>!permission?.is_secretary||!!permission?.can_receive_notifications;
  const isIos=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(/Macintosh/i.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
  const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  let generation=0, operation=Promise.resolve(), busy=false, syncQueued=false;
  let actionGeneration=0;
  let notificationChannel=null, channelScope=null;
  const preferences=new Map();
  const preferenceKey=id=>'carometro:push-choice:'+id;
  const getChoice=id=>{try{return localStorage.getItem(preferenceKey(id))||preferences.get(id);}catch{return preferences.get(id);}};
  const setChoice=(id,value)=>{preferences.set(id,value);try{localStorage.setItem(preferenceKey(id),value);}catch{}};
  const captureScope=()=>({userId:user?.id,schoolId:window.getActiveSchoolId?.(),generation});
  const isCurrent=scope=>!!scope.userId&&!!scope.schoolId&&scope.userId===user?.id&&scope.schoolId===window.getActiveSchoolId?.()&&scope.generation===generation&&canUseNotifications()&&!document.getElementById('app').classList.contains('hidden');
  const enqueue=task=>{const result=operation.then(task);operation=result.catch(()=>{});return result;};
  async function register(){
    if(!supported())return null;
    const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    return registration.active?registration:await navigator.serviceWorker.ready;
  }
  function renderPush(active=false){
    pushButton.dataset.active=String(active);
    pushButton.textContent=active?'Desativar notificações':'Ativar notificações';
    pushButton.disabled=busy;startButton.disabled=busy;
  }
  async function removeChannel(){
    const previous=notificationChannel;notificationChannel=null;channelScope=null;
    if(previous)await db.removeChannel(previous);
  }
  async function clearNotificationChannel(){
    generation+=1;
    actionGeneration+=1;busy=false;
    pushButton.classList.add('hidden');onboarding.classList.add('hidden');renderPush(false);
    await removeChannel();
  }
  window.clearCarometroNotificationChannel=clearNotificationChannel;
  async function saveSubscription(subscription,scope){
    if(!isCurrent(scope))return false;
    const signedInUser=(await db.auth.getUser()).data.user;
    if(!isCurrent(scope)||signedInUser?.id!==scope.userId)return false;
    const json=subscription.toJSON(),keys=json.keys||{};
    const {error}=await db.rpc('claim_push_subscription',{p_endpoint:json.endpoint,p_p256dh:keys.p256dh,p_auth_key:keys.auth,p_user_agent:navigator.userAgent});
    if(error)throw error;
    return isCurrent(scope);
  }
  // A saída espera as operações pendentes antes de remover o vínculo; nenhuma
  // restauração antiga pode reivindicar o endpoint depois da limpeza.
  window.disableCarometroPush=()=>{
    generation+=1;
    return enqueue(async()=>{
      const signedInUser=(await db.auth.getUser()).data.user;
      const registration=await register();
      const subscription=await registration?.pushManager.getSubscription();
      if(!signedInUser||!subscription)return;
      const {error}=await db.from('push_subscriptions').delete().eq('endpoint',subscription.endpoint).eq('user_id',signedInUser.id);
      if(error)console.warn('[Push] Não foi possível desvincular este dispositivo no logout.');
    }).catch(()=>{console.warn('[Push] Falha ao desvincular o dispositivo no logout.');});
  };
  const showPushHelp=()=>{
    if(isIos()&&!isStandalone()){showInstallHelp();return;}
    if(!supported()){alert('Este navegador não oferece notificações neste dispositivo. Os avisos continuam disponíveis no sino do CARÔMETRO.');return;}
    alert('As notificações estão bloqueadas nas configurações deste site. Autorize as notificações no navegador e depois toque em Ativar notificações.');
  };
  function syncOnboarding(scope,active){
    const choice=getChoice(scope.userId);
    const needsHelp=isIos()&&!isStandalone();
    startButton.textContent=needsHelp?'Como ativar no iPhone/iPad':'Ativar notificações';
    const visible=isCurrent(scope)&&!active&&!choice&&(supported()||needsHelp)&&(!supported()||Notification.permission!=='denied');
    onboarding.classList.toggle('hidden',!visible);
  }
  async function syncButtons(){
    const scope=captureScope();
    if(!isCurrent(scope)){await clearNotificationChannel();return;}
    const registration=await register();
    if(!isCurrent(scope))return;
    let active=false;
    if(registration&&Notification.permission==='granted'&&getChoice(scope.userId)!=='disabled'){
      let subscription=await registration.pushManager.getSubscription();
      if(!isCurrent(scope))return;
      if(!subscription&&!VAPID_PUBLIC_KEY.startsWith('__'))subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToUint8(VAPID_PUBLIC_KEY)});
      if(subscription)active=await saveSubscription(subscription,scope);
    }
    if(!isCurrent(scope))return;
    renderPush(active);
    pushButton.classList.remove('hidden');
    syncOnboarding(scope,active);
    const nextScope=scope.userId+':'+scope.schoolId;
    if(channelScope!==nextScope){
      await removeChannel();
      if(!isCurrent(scope))return;
      channelScope=nextScope;
      notificationChannel=db.channel('push-ui-'+nextScope).on('postgres_changes',{event:'INSERT',schema:'public',table:'user_notifications',filter:'school_id=eq.'+scope.schoolId},payload=>{
        if(isCurrent(scope)&&payload.new.recipient_id===scope.userId&&payload.new.school_id===scope.schoolId)toast(payload.new.title);
      }).subscribe();
    }
  }
  function requestSync(){
    if(syncQueued)return;
    syncQueued=true;
    void enqueue(async()=>{syncQueued=false;await syncButtons();}).catch(()=>{
      if(isCurrent(captureScope())){renderPush(false);pushButton.classList.remove('hidden');}
    });
  }
  async function deactivatePush(scope){
    if(!isCurrent(scope))return;
    // A escolha é por conta e dispositivo; não confundir consentimento do
    // navegador com a preferência explícita de desativar no CARÔMETRO.
    setChoice(scope.userId,'disabled');
    const registration=await register();
    if(!isCurrent(scope))return;
    const subscription=await registration?.pushManager.getSubscription();
    if(!isCurrent(scope))return;
    if(subscription){
      const {error}=await db.from('push_subscriptions').delete().eq('endpoint',subscription.endpoint).eq('user_id',scope.userId);
      if(error)throw error;
      if(!isCurrent(scope))return;
      await subscription.unsubscribe();
    }
    if(isCurrent(scope)){renderPush(false);onboarding.classList.add('hidden');toast('Notificações desativadas neste dispositivo.');}
  }
  function activatePush(){
    const scope=captureScope();
    if(busy||!isCurrent(scope))return;
    if(!supported()||Notification.permission==='denied'){showPushHelp();return;}
    if(VAPID_PUBLIC_KEY.startsWith('__')){toast('Não foi possível configurar as notificações agora.');return;}
    // requestPermission precisa ocorrer no clique, antes da fila/primeiro await.
    const permissionResult=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
    const action=++actionGeneration;
    busy=true;renderPush(false);
    // Esperar a escolha humana fora da fila permite sair da conta mesmo se
    // o pedido de consentimento ficar aberto no navegador.
    return permissionResult.then(granted=>{
      if(!isCurrent(scope))return;
      if(granted!=='granted'){setChoice(scope.userId,'later');onboarding.classList.add('hidden');toast('As notificações não foram autorizadas. Você pode ativá-las depois.');return;}
      return enqueue(async()=>{
      if(!isCurrent(scope))return;
      const registration=await register();
      if(!registration||!isCurrent(scope))return;
      let subscription=await registration.pushManager.getSubscription();
      if(!isCurrent(scope))return;
      subscription||=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToUint8(VAPID_PUBLIC_KEY)});
      if(await saveSubscription(subscription,scope)){
        setChoice(scope.userId,'enabled');renderPush(true);onboarding.classList.add('hidden');toast('Este dispositivo receberá os avisos autorizados para sua conta.');
      }
      });
    }).catch(()=>{if(isCurrent(scope))toast('Não foi possível ativar as notificações. Tente novamente.');}).finally(()=>{if(action===actionGeneration){busy=false;pushButton.disabled=false;startButton.disabled=false;}});
  }
  let installedThisSession=false;
  const syncInstallButton=()=>pwaButton.classList.toggle('hidden',installedThisSession||isStandalone());
  const showInstallHelp=()=>alert(isIos()
    ? 'No iPhone/iPad: abra o CARÔMETRO no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.'
    : 'Abra o CARÔMETRO no navegador. No menu, procure Instalar aplicativo ou Adicionar à tela inicial. No computador, procure também o ícone de instalação na barra de endereço. Se a opção não aparecer, tente no Chrome ou Edge. Se já estiver instalado, abra pelo ícone do CARÔMETRO.');
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;syncInstallButton();});
  window.addEventListener('appinstalled',()=>{installedThisSession=true;installPrompt=null;syncInstallButton();toast('CARÔMETRO instalado.');});
  matchMedia('(display-mode: standalone)').addEventListener('change',syncInstallButton);
  syncInstallButton();
  pwaButton.onclick=async()=>{
    if(!installPrompt){showInstallHelp();return;}
    const prompt=installPrompt;installPrompt=null;
    try{await prompt.prompt();await prompt.userChoice;}catch{showInstallHelp();}
    syncInstallButton();
  };
  pushButton.onclick=()=>{
    if(busy)return;
    if(pushButton.dataset.active!=='true')return activatePush();
    const scope=captureScope();if(!isCurrent(scope))return;
    const action=++actionGeneration;
    busy=true;pushButton.disabled=true;
    return enqueue(()=>deactivatePush(scope)).catch(()=>{if(isCurrent(scope))toast('Não foi possível confirmar a desativação. Tente novamente.');}).finally(()=>{if(action===actionGeneration){busy=false;pushButton.disabled=false;}});
  };
  startButton.onclick=activatePush;
  document.getElementById('dismissPushOnboarding').onclick=()=>{const scope=captureScope();if(isCurrent(scope))setChoice(scope.userId,'later');onboarding.classList.add('hidden');};
  new MutationObserver(()=>{
    if(document.getElementById('app').classList.contains('hidden'))void clearNotificationChannel();
    else requestSync();
  }).observe(document.getElementById('app'),{attributes:true,attributeFilter:['class']});
  document.addEventListener('carometro:permission-refresh',()=>{if(!isCurrent(captureScope()))void clearNotificationChannel();else requestSync();});
  document.addEventListener('carometro:school-context-ready',requestSync);
  window.addEventListener('online',requestSync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)requestSync();});
  db.auth.onAuthStateChange((_event,session)=>{if(!session)void clearNotificationChannel();});
  requestSync();
});
