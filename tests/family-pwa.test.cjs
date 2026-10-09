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

async function run({ ios = false, permission = 'default', standalone = false, permissionRequest } = {}) {
  const elements = new Map();
  const events = new Map();
  const calls = [];
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle: (x, force) => force ? classes.add(x) : classes.delete(x) },
        textContent:'', innerHTML:'', value:'', disabled:false,
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
    rpc:async name => { calls.push(name); return { data:name==='family_my_students' ? [{ link_id:'link',student_name:'Aluno',school_name:'Escola',class_name:'6A' }] : null, error:null }; },
    from:() => ({ select:() => ({ eq:() => ({ eq:() => ({ eq:() => ({ maybeSingle:async () => ({ data:null,error:null }) }) }) }) }) }),
  };
  const notification = { permission, requestPermission:() => { calls.push('permission'); return permissionRequest ? permissionRequest() : Promise.resolve('granted'); } };
  const context = {
    window:{ CAROMETRO_RUNTIME_CONFIG:{ backendConfigured:true,supabaseUrl:'https://example.test',supabasePublishableKey:'key',vapidPublicKey:'AQID' }, supabase:{ createClient:() => db }, isSecureContext:true, PushManager:function(){}, Notification:notification, matchMedia:() => ({ matches:standalone, addEventListener:() => {} }), addEventListener:(name,fn) => events.set(name,fn) },
    document:{ addEventListener:(name,fn) => events.set(name,fn), getElementById:element, createElement:() => ({ textContent:'',innerHTML:'' }) },
    navigator:{ userAgent:ios?'Mozilla/5.0 iPhone':'Mozilla/5.0 Android', maxTouchPoints:ios?5:0, serviceWorker:{ register:async () => registration, ready:Promise.resolve(registration) }, standalone:false },
    Notification:notification, PushManager:function(){}, matchMedia:() => ({ matches:standalone }),
    URL, location:{ href:'https://example.test/familia.html', pathname:'/familia.html' },
    history:{ replaceState:() => {} }, Intl, Uint8Array, atob, console,
  };
  vm.runInNewContext(source, context);
  await events.get('DOMContentLoaded')();
  return { element, events, calls, context };
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
