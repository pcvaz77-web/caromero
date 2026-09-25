const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const root = path.join(__dirname,'..','..','..');
const html = fs.readFileSync(path.join(root,'assistente-siap-conta.html'),'utf8');
const script = fs.readFileSync(path.join(root,'assistente-siap-conta.js'),'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve,0));

function accountPage(initialSession=null, accessStatus={active:true,mode:'carometro',daysRemaining:5}) {
  const dom = new JSDOM(html,{url:'https://sistemacarometro.com.br/assistente-siap-conta.html?plano=account',runScripts:'outside-only'});
  const {window} = dom;
  let session=initialSession;
  const calls=[];
  const db={
    auth:{
      getSession:async()=>({data:{session}}),
      signInWithOtp:async args=>{calls.push({action:'send',args});return {error:null};},
      verifyOtp:async args=>{calls.push({action:'verify',args});session={access_token:'verified',expires_at:Math.floor(Date.now()/1000)+3600,user:{email:args.email}};return {error:null};},
      onAuthStateChange:()=>{},
      signOut:async()=>{session=null;}
    },
    functions:{invoke:async()=>({data:{ok:true,access:{active:false}}})},
    rpc:async()=>({data:accessStatus,error:null})
  };
  window.CAROMETRO_RUNTIME_CONFIG={supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'test',siapAssistantStoreUrl:'https://example.com/extension'};
  window.supabase={createClient:()=>db};
  window.eval(script);
  return {dom,window,calls};
}

test('concessão com login existente no Carômetro não exige novo código',async()=>{
  const {dom,window,calls}=accountPage({access_token:'carometro-session',expires_at:Math.floor(Date.now()/1000)+3600,user:{email:'professor@example.com'}});
  await settle();
  assert.equal(window.document.getElementById('loginForm').hidden,true);
  assert.equal(window.document.getElementById('checkoutPanel').hidden,false);
  assert.equal(window.document.getElementById('connectAssistantAccount').hidden,false);
  assert.deepEqual(calls,[]);
  dom.window.close();
});

test('concessão permanente não aparece como zero dias restantes',async()=>{
  const {dom,window}=accountPage(
    {access_token:'carometro-session',expires_at:Math.floor(Date.now()/1000)+3600,user:{email:'professor@example.com'}},
    {active:true,mode:'carometro',daysRemaining:null,permanent:true}
  );
  await settle();
  const summary=window.document.getElementById('assistantAccessSummary').textContent;
  assert.match(summary,/concessão permanente/);
  assert.doesNotMatch(summary,/0 dia\(s\)/);
  dom.window.close();
});

test('conta externa pode confirmar código recebido antes de conectar',async()=>{
  const {dom,window,calls}=accountPage();
  await settle();
  const form=window.document.getElementById('loginForm');
  window.document.getElementById('accountEmail').value='comprador@example.com';
  form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await settle();
  assert.equal(window.document.getElementById('accountCodeStep').hidden,false);
  window.document.getElementById('accountOtp').value='123456';
  window.document.getElementById('verifyAccountCode').click();
  await settle();
  assert.equal(calls[0].action,'send');
  assert.equal(calls[1].action,'verify');
  assert.equal(calls[1].args.email,'comprador@example.com');
  assert.equal(calls[1].args.token,'123456');
  assert.equal(calls[1].args.type,'email');
  assert.equal(form.hidden,true);
  assert.equal(window.document.getElementById('checkoutPanel').hidden,false);
  dom.window.close();
});
