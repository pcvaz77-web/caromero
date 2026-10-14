const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('../services/siap-exam/node_modules/jsdom');

const root = path.join(__dirname,'..');
const source = fs.readFileSync(path.join(root,'permissions-and-details.js'),'utf8');
const migration = fs.readFileSync(path.join(root,'supabase/migrations/180_family_portal_coordinator_permission.sql'),'utf8');
const section = (start,end) => source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('coordenadores têm Portal da Família por padrão e a revogação vale só para seu vínculo', () => {
  const code = section('  const permissionFromMembership =','  // Consulta o vínculo');
  const context = {membership:null,result:null};
  vm.createContext(context);
  vm.runInContext(code,context);
  const allowed = (role,setting) => {
    context.membership = {id:'member',school_id:'school',user_id:'person',role,school_member_permissions:{can_manage_family_portal:setting}};
    vm.runInContext('result=permissionFromMembership(membership).can_manage_family_portal',context);
    return context.result;
  };
  assert.equal(allowed('coordinator',null),true);
  assert.equal(allowed('coordinator',true),true);
  assert.equal(allowed('coordinator',false),false);
  assert.equal(allowed('teacher',true),false);
  assert.equal(allowed('secretary',true),false);
  assert.match(migration,/m\.role = 'coordinator' and coalesce\(p\.can_manage_family_portal, true\)/);
  assert.match(migration,/actor\.school_id = v_target\.school_id[\s\S]*actor\.role = 'school_admin'/);
});

test('menu exige a escola ativa e a permissão; checkbox do coordenador nasce marcado', () => {
  const getter = section('  window.canManageFamilyPortal =','  function applyCurrentPermission');
  const context = {permission:null,window:{getActiveSchoolId:()=> 'school'}};
  vm.createContext(context);
  vm.runInContext(getter,context);
  context.permission = {school_id:'school',role:'viewer',is_coordinator:true,can_manage_family_portal:true};
  assert.equal(context.window.canManageFamilyPortal(),true);
  context.permission.can_manage_family_portal=false;
  assert.equal(context.window.canManageFamilyPortal(),false);
  context.permission.school_id='other-school';
  context.permission.can_manage_family_portal=true;
  assert.equal(context.window.canManageFamilyPortal(),false);
  context.permission={school_id:'school',role:'admin'};
  assert.equal(context.window.canManageFamilyPortal(),true);

  const markup = source.match(/^    const yearCheck = .*;$/m)?.[0];
  assert.ok(markup,'checkboxes do coordenador devem existir');
  context.item={member_id:'coordinator-member',member_status:'active',is_coordinator:true,can_manage_family_portal:null};
  vm.runInContext(`${markup}\nresult=yearCheck(item,false)`,context);
  assert.match(context.result,/checked[^>]*onchange="setFamilyPortalPermission\('coordinator-member',this.checked\)"/);
  context.item.can_manage_family_portal=false;
  vm.runInContext('result=yearCheck(item,false)',context);
  assert.doesNotMatch(context.result,/checked[^>]*onchange="setFamilyPortalPermission/);
  vm.runInContext('result=yearCheck(item,true)',context);
  assert.doesNotMatch(context.result,/Portal da Família/);
});

test('menu reage à revogação e nunca aparece para professor', async () => {
  const dom = new JSDOM('<section id="app"><aside class="side"><div class="nav"></div></aside></section>',
    {url:'https://carometro.example/',runScripts:'outside-only'});
  const {window} = dom;
  let role='coordinator',permitted=true;
  window.db={};
  window.getActiveSchoolRole=()=>role;
  window.canManageFamilyPortal=()=>permitted;
  window.eval(fs.readFileSync(path.join(root,'family-school.js'),'utf8'));
  await new Promise(resolve => window.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  const button=window.document.querySelector('.side .nav button');
  assert.ok(button);
  assert.equal(button.hidden,false);
  permitted=false;
  window.document.dispatchEvent(new window.Event('carometro:permission-refresh'));
  assert.equal(button.hidden,true);
  role='teacher';permitted=true;
  window.document.dispatchEvent(new window.Event('carometro:permission-refresh'));
  assert.equal(button.hidden,true);
  role='school_admin';
  window.document.dispatchEvent(new window.Event('carometro:permission-refresh'));
  assert.equal(button.hidden,false);
  window.close();
});
