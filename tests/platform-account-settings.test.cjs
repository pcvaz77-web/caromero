const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('../services/siap-exam/node_modules/jsdom');

const source = fs.readFileSync(path.join(__dirname, '..', 'subscription-settings.js'), 'utf8');
const start = source.indexOf('  async function openSettings() {');
const end = source.indexOf("  document.addEventListener('carometro:platform-settings-changed'", start);

function fixture() {
  const dom = new JSDOM('<div id="settingsModal" class="modal-bg hidden"><div class="modal"><input id="accessUserSearch"><p id="accessSearchCount"></p><div id="accessUsers"></div></div></div>');
  const accounts = [
    {user_id:'owner',full_name:'Administrador',email:'dono@example.com',role:'platform_owner',access_status:'active',email_confirmed:true},
    {user_id:'joao',full_name:'João Passos',email:'joao@example.com',access_status:'active',email_confirmed:true,active_memberships:1},
    {user_id:'carla',full_name:'Carla Souza',email:'carla@example.com',access_status:'active',email_confirmed:true,active_memberships:1}
  ];
  const actions=[];
  const db={
    rpc:async(name,args)=>{
      if(name==='admin_list_carometro_accounts')return {data:accounts,error:null};
      if(name==='platform_set_account_access'){
        accounts.find(item=>item.user_id===args.target_user_id).access_status=args.target_status;
        actions.push(name);
        return {error:null};
      }
      throw new Error(`RPC inesperada: ${name}`);
    },
    functions:{invoke:async(name,{body})=>{
      assert.equal(name,'manage-user');
      actions.push(body.action);
      if(body.action==='permanent_delete')accounts.splice(accounts.findIndex(item=>item.user_id===body.userId),1);
      return {data:{},error:null};
    }}
  };
  const context=vm.createContext({
    document:dom.window.document,window:dom.window,modal:dom.window.document.getElementById('settingsModal'),db,
    refreshPlatformOwner:async()=>true,toast:()=>{},esc:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
    confirm:()=>true,prompt:()=> 'carla@example.com'
  });
  vm.runInContext(`${source.slice(start,end)}\nglobalThis.testOpenSettings=openSettings;`,context);
  return {dom,context,accounts,actions};
}

test('janela oferece busca por nome e e-mail sem a opção duplicada de planos', async()=>{
  assert.match(source,/id="accessUserSearch"[^>]*type="search"/);
  assert.doesNotMatch(source,/id="showSubscriptionButton"/);
  const {dom,context}=fixture();
  await context.testOpenSettings();
  const search=dom.window.document.getElementById('accessUserSearch');
  search.value='joao';search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(dom.window.document.querySelectorAll('.access-user').length,1);
  assert.match(dom.window.document.getElementById('accessUsers').textContent,/João Passos/);
  search.value='CARLA@EXAMPLE.COM';search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(dom.window.document.querySelectorAll('.access-user').length,1);
  assert.match(dom.window.document.getElementById('accessUsers').textContent,/Carla Souza/);
  search.value='sem resultado';search.dispatchEvent(new dom.window.Event('input'));
  assert.match(dom.window.document.getElementById('accessUsers').textContent,/Nenhum usuário corresponde/);
  dom.window.close();
});

test('suspender, cancelar e excluir mantêm filtro e posição da janela', async()=>{
  const {dom,context,actions}=fixture();
  await context.testOpenSettings();
  const search=dom.window.document.getElementById('accessUserSearch');
  const scroller=dom.window.document.querySelector('#settingsModal .modal');
  search.value='carla';search.dispatchEvent(new dom.window.Event('input'));
  scroller.scrollTop=280;
  await context.window.setPlatformAccess('carla','suspended');
  assert.equal(scroller.scrollTop,280);
  assert.equal(search.value,'carla');
  assert.match(dom.window.document.getElementById('accessUsers').textContent,/Login suspenso/);
  scroller.scrollTop=280;
  await context.window.manageUserAccount('cancel_login','carla','carla@example.com');
  assert.equal(scroller.scrollTop,280);
  assert.equal(search.value,'carla');
  const cancel=dom.window.document.querySelector('#accessUsers .access-actions .btn.secondary');
  assert.equal(cancel.textContent,'Reativar login');
  scroller.scrollTop=280;
  await context.window.manageUserAccount('permanent_delete','carla','carla@example.com');
  assert.equal(scroller.scrollTop,280);
  assert.equal(search.value,'carla');
  assert.match(dom.window.document.getElementById('accessUsers').textContent,/Nenhum usuário corresponde/);
  assert.deepEqual(actions,['platform_set_account_access','cancel_login','permanent_delete']);
  dom.window.close();
});
