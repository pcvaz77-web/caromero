const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'familia.js'), 'utf8');

test('manifesto inicia dentro da rota canônica do Portal da Família', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'familia.webmanifest'), 'utf8'));
  const html = fs.readFileSync(path.join(__dirname, '..', 'familia.html'), 'utf8');
  assert.equal(manifest.start_url, '/familia');
  assert.equal(manifest.scope, '/familia');
  assert.equal(manifest.id, '/familia.html');
  assert.match(html, /rel="manifest" href="familia\.webmanifest\?v=2"/);
});

async function run({ ios = false, permission = 'default', standalone = false, permissionRequest, feed = [], historyRows = [] } = {}) {
  const elements = new Map();
  const events = new Map();
  const calls = [];
  let noticeHandler;
  let poll;
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle: (x, force) => force ? classes.add(x) : classes.delete(x) },
        textContent:'', innerHTML:'', value:'', disabled:false,
        setAttribute:() => {}, insertAdjacentHTML:(_, html) => { element(id).innerHTML += html; },
      });
    }
    return elements.get(id);
  };
  const subscription = { endpoint:'https://push.example/family', toJSON:() => ({ endpoint:'https://push.example/family', keys:{ p256dh:'key', auth:'auth' } }) };
  const registration = { active:true, pushManager:{ getSubscription:async () => null, subscribe:async () => { calls.push('subscribe'); return subscription; } } };
  const db = {
    auth: {
      getSession:async () => ({ data:{ session:{ user:{ id:'parent' } } } }),
      getUser:async () => ({ data:{ user:{ id:'parent' } } }),
      signOut:async () => {},
    },
    rpc:async (name,args) => { calls.push(name); if (name==='family_history') calls.push({historyArgs:args}); return { data:name==='family_my_students' ? [{ link_id:'link',student_name:'Aluno',school_name:'Escola',class_name:'6A' }] : name==='family_feed' ? feed : name==='family_history' ? historyRows : null, error:null }; },
    from:() => ({ select:() => ({ eq:() => ({ eq:() => ({ eq:() => ({ maybeSingle:async () => ({ data:null,error:null }) }) }) }) }) }),
    channel:() => ({ on:(_,__,handler) => { noticeHandler=handler; return { subscribe:() => ({}) }; } }),
    removeChannel:async () => {},
  };
  const notification = { permission, requestPermission:() => { calls.push('permission'); return permissionRequest ? permissionRequest() : Promise.resolve('granted'); } };
  const context = {
    window:{ CAROMETRO_RUNTIME_CONFIG:{ backendConfigured:true,supabaseUrl:'https://example.test',supabasePublishableKey:'key',vapidPublicKey:'AQID' }, supabase:{ createClient:() => db }, isSecureContext:true, PushManager:function(){}, Notification:notification, matchMedia:() => ({ matches:standalone, addEventListener:() => {} }), addEventListener:(name,fn) => events.set(name,fn) },
    document:{ addEventListener:(name,fn) => events.set(name,fn), getElementById:element, createElement:() => {
      let value = '';
      return { set textContent(text) { value = String(text); }, get innerHTML() { return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); } };
    } },
    navigator:{ userAgent:ios?'Mozilla/5.0 iPhone':'Mozilla/5.0 Android', maxTouchPoints:ios?5:0, serviceWorker:{ register:async () => registration, ready:Promise.resolve(registration) }, standalone:false },
    Notification:notification, PushManager:function(){}, matchMedia:() => ({ matches:standalone }),
    setInterval:fn => { poll=fn; return 1; }, clearInterval:() => {},
    URL, location:{ href:'https://example.test/familia.html', pathname:'/familia.html' },
    history:{ replaceState:() => {} }, Intl, Uint8Array, atob, console,
  };
  vm.runInNewContext(source, context);
  await events.get('DOMContentLoaded')();
  return { element, events, calls, context, notice:payload => noticeHandler?.(payload), poll:() => poll?.(), setFeed:rows => { feed=rows; }, setHistory:rows => { historyRows=rows; } };
}

test('após entrar, mostra instalação e explica notificações sem pedir permissão automaticamente', async () => {
  const h = await run();
  assert.equal(h.element('portal').classList.contains('hidden'), false);
  assert.equal(h.element('installFamily').classList.contains('hidden'), false);
  assert.equal(h.element('installFamilyAccessBox').classList.contains('hidden'), false);
  assert.equal(h.calls.includes('permission'), false);
  await h.element('installFamilyAccess').onclick();
  assert.match(h.element('installFamilyAccessHelp').textContent, /Chrome ou Edge/);
});

test('o responsável só autoriza e registra o aparelho após tocar no botão', async () => {
  const h = await run();
  await h.element('enableFamilyPush').onclick({ currentTarget:h.element('enableFamilyPush') });
  assert.deepEqual(h.calls.filter(x => x === 'permission' || x === 'subscribe' || x === 'claim_push_subscription'), ['permission','subscribe','claim_push_subscription']);
  assert.match(h.element('familyPushStatus').textContent, /receberá avisos/);
});

test('iPhone no navegador explica a instalação antes de oferecer push', async () => {
  const h = await run({ ios:true });
  await h.element('installFamily').onclick();
  assert.match(h.element('installFamilyHelp').textContent, /Safari/);
  await h.element('enableFamilyPush').onclick({ currentTarget:h.element('enableFamilyPush') });
  assert.equal(h.calls.includes('permission'), false);
  assert.match(h.element('familyPushStatus').textContent, /Tela de Início/);
});

test('aplicativo já instalado oculta o botão de instalação', async () => {
  const h = await run({ standalone:true });
  assert.equal(h.element('installFamily').classList.contains('hidden'), true);
  assert.equal(h.element('installFamilyAccessBox').classList.contains('hidden'), true);
});

test('após instalar, orienta ativar notificações sem abrir o pedido nativo sozinho', async () => {
  const h = await run();
  h.events.get('appinstalled')();
  assert.equal(h.element('installFamily').classList.contains('hidden'), true);
  assert.match(h.element('installFamilyHelp').textContent, /Ativar notificações/);
  assert.equal(h.calls.includes('permission'), false);
});

test('sair enquanto o aparelho pergunta não registra push para uma sessão encerrada', async () => {
  let allow;
  const h = await run({ permissionRequest:() => new Promise(resolve => { allow = resolve; }) });
  const activating = h.element('enableFamilyPush').onclick({ currentTarget:h.element('enableFamilyPush') });
  await h.element('signOut').onclick();
  allow('granted');
  await activating;
  assert.equal(h.calls.includes('claim_push_subscription'), false);
});

test('aviso em tempo real atualiza o filho aberto sem recarregar a página', async () => {
  const h = await run();
  await h.element('students').onclick({ target:{ closest:() => ({dataset:{link:'link'}}) } });
  h.setFeed([{message_id:'m1',title:'Entrada na escola',body:'Entrada registrada em 09/10/2026 às 20:50.',category:'entry',published_at:'2026-10-09T23:50:00Z'}]);
  h.notice({new:{target_type:'family_message'}});
  await new Promise(setImmediate);
  assert.match(h.element('messages').innerHTML, /entry-highlight.*<strong>Entrada registrada/);
  assert.match(h.element('portalLiveStatus').textContent, /nova comunicação/);
});

test('consulta de recuperação atualiza o histórico se a conexão em tempo real falhar', async () => {
  const h = await run();
  await h.element('students').onclick({ target:{ closest:() => ({dataset:{link:'link'}}) } });
  h.setFeed([{message_id:'m2',title:'Entrada na escola',body:'Entrada registrada.',category:'entry',published_at:'2026-10-09T23:50:00Z'}]);
  h.poll();
  await new Promise(setImmediate);
  assert.match(h.element('messages').innerHTML, /Entrada registrada/);
});

test('históricos usam o vínculo do filho, categoria e filtros separados', async () => {
  const h = await run({historyRows:[{title:'Ocorrência compartilhada',body:'Comunicado',event_date:'2026-10-09',professor_name:'Prof. Ana'}]});
  await h.element('students').onclick({ target:{ closest:() => ({dataset:{link:'link'}}) } });
  await h.element('showOccurrenceHistory').onclick();
  h.element('historyDate').value = '2026-10-09';
  h.element('historyTeacher').value = 'Ana';
  await h.element('historyFilters').onsubmit({preventDefault:() => {}});
  const occurrence = h.calls.filter(x => x?.historyArgs).at(-1).historyArgs;
  assert.deepEqual([occurrence.p_link_id,occurrence.p_category,occurrence.p_date,occurrence.p_teacher], ['link','occurrence','2026-10-09','Ana']);
  assert.match(h.element('historyResults').innerHTML, /Prof. Ana/);
  h.setHistory([{event_at:'2026-10-09T23:50:00Z'}]);
  await h.element('showEntryHistory').onclick();
  const entry = h.calls.filter(x => x?.historyArgs).at(-1).historyArgs;
  assert.deepEqual([entry.p_link_id,entry.p_category,entry.p_date,entry.p_teacher], ['link','entry',null,null]);
  assert.match(h.element('historyResults').innerHTML, /<strong>Entrada registrada/);
});

test('push recebido avisa o Portal aberto sem recarregar e preserva o aviso do sistema', async () => {
  const worker = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const handlers = new Map();
  const posted = [];
  const shown = [];
  vm.runInNewContext(worker, {
    self:{ addEventListener:(type,handler) => handlers.set(type,handler),
      registration:{showNotification:async (title,options) => { shown.push({title,options}); }},
      clients:{matchAll:async () => [
        {url:'https://example.test/familia',postMessage:message => posted.push(message)},
        {url:'https://example.test/index.html',postMessage:message => posted.push(message)},
      ]},
    }, URL, Promise,
  });
  let work;
  handlers.get('push')({ data:{json:() => ({title:'Portal da Família',body:'Nova comunicação',url:'./familia.html'})},waitUntil:promise => { work=promise; } });
  await work;
  assert.equal(shown.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(posted)), [{type:'family-notice'}]);
});

test('a nova comunicação sinaliza o Portal mesmo sem assinatura push do aparelho', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '171_family_live_feed_and_history.sql'), 'utf8');
  const queue = migration.split('create or replace function public.queue_family_push_for_receipt()')[1].split('create or replace function public.family_can_read_push_notice')[0];
  assert.match(queue, /insert into public\.user_notifications/);
  assert.doesNotMatch(queue, /push_subscriptions/);
  assert.match(migration, /create policy "Family notices for active guardian"/);
});
