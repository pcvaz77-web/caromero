const test=require('node:test');
const assert=require('node:assert/strict');
const {harness,deferred,flush}=require('./helpers/browser-harness.cjs');

test('primeiro acesso oferece ativacao sem solicitar consentimento sozinho',async()=>{
  const h=harness('pwa-notifications.js');await h.ready();
  assert.equal(h.get('pushOnboarding').classList.contains('hidden'),false);
  assert.equal(h.calls.includes('permission'),false);
  await h.get('startPushOnboarding').onclick();
  assert.equal(h.calls.filter(x=>x==='permission').length,1);
  assert.equal(h.get('enableCarometroPush').dataset.active,'true');
  assert.equal(h.get('pushOnboarding').classList.contains('hidden'),true);
});
test('consentimento concedido restaura automaticamente e desativacao persiste',async()=>{
  const storage=new Map();const h=harness('pwa-notifications.js',{permission:'granted',storage});await h.ready();
  assert.equal(h.get('enableCarometroPush').dataset.active,'true');
  await h.get('enableCarometroPush').onclick();
  await h.emit(h.events,'carometro:permission-refresh');
  assert.equal(h.calls.filter(x=>x==='subscribe').length,1);
  assert.equal(h.get('enableCarometroPush').dataset.active,'false');
  const reloaded=harness('pwa-notifications.js',{permission:'granted',storage});await reloaded.ready();
  assert.equal(reloaded.calls.includes('subscribe'),false);
});
test('falha de gravacao nao informa notificacoes ativadas',async()=>{
  const h=harness('pwa-notifications.js',{rpc:()=>({error:new Error('offline')})});await h.ready();await h.get('enableCarometroPush').onclick();
  assert.notEqual(h.get('enableCarometroPush').dataset.active,'true');
  assert.match(h.messages.at(-1),/Não foi possível ativar/);
});
test('logout aguarda reivindicacao pendente e impede restauracao posterior',async()=>{
  const pending=deferred();const h=harness('pwa-notifications.js',{permission:'granted',rpc:()=>pending.promise});
  h.context.db.auth.getUser=async()=>({data:{user:{id:'user-a'}}});await h.ready();
  h.get('app').classList.add('hidden');h.context.user=null;
  const signout=h.context.window.disableCarometroPush();
  pending.resolve({error:null});await signout;await flush();
  assert.notEqual(h.get('enableCarometroPush').dataset.active,'true');
  assert.equal(h.calls.filter(x=>x==='claim_push_subscription').length,1);
  const deletion=h.calls.findIndex(x=>x?.table==='push_subscriptions'&&x.operations.some(op=>op[0]==='delete'));
  assert.ok(deletion>h.calls.indexOf('claim_push_subscription'));
});
test('pedido de consentimento sem resposta nao bloqueia logout',async()=>{
  const prompt=deferred();const h=harness('pwa-notifications.js');await h.ready();
  h.context.Notification.requestPermission=()=>prompt.promise;
  const activation=h.get('startPushOnboarding').onclick();
  h.get('app').classList.add('hidden');
  await h.context.window.disableCarometroPush();
  prompt.resolve('granted');await activation;
  assert.equal(h.calls.includes('claim_push_subscription'),false);
});
test('secretaria sem autorizacao nao recebe onboarding ou assinatura',async()=>{
  const h=harness('pwa-notifications.js',{permission:'granted'});h.context.permission={is_secretary:true,can_receive_notifications:false};await h.ready();
  assert.equal(h.calls.includes('subscribe'),false);
  assert.equal(h.get('pushOnboarding').classList.contains('hidden'),true);
});
test('resposta atrasada do sino nao reaparece depois do logout',async()=>{
  const pending=deferred();const h=harness('notification-center.js',{query:()=>pending.promise});await h.ready();
  const loading=h.context.window.testCenter.loadNotifications();await flush();
  h.context.user=null;h.get('app').classList.add('hidden');await h.context.window.testCenter.stopNotificationCenter();
  pending.resolve({data:[{id:1,title:'Conta anterior',body:'Privado'}],error:null});await loading;
  assert.equal(h.context.window.testCenter.getItems().length,0);
  assert.doesNotMatch(h.get('notificationList').innerHTML,/Privado/);
});
test('Realtime e consulta simultanea nao duplicam a notificacao',async()=>{
  const row={id:1,school_id:'school-a',recipient_id:'user-a',title:'Aviso',body:'Novo',created_at:new Date().toISOString()};
  const h=harness('notification-center.js',{query:()=>({data:[row],error:null,count:1})});await h.ready();await h.context.window.testCenter.startNotificationCenter();
  const channel=h.channels.at(-1);await channel.handlers.find(x=>x.filter.event==='INSERT').fn({new:row});
  assert.equal(h.context.window.testCenter.getItems().length,1);
  h.context.user={id:'user-b'};
  await channel.handlers.find(x=>x.filter.event==='INSERT').fn({new:{...row,id:2}});
  assert.equal(h.context.window.testCenter.getItems().length,1);
});
