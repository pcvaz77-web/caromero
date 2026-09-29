const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');

test('estado visual persiste independente da execucao', () => {
  assert.match(source, /createShell\(stored\.panelOpen === true, false, stored\)/);
  assert.match(source, /data-action="minimize"[^\n]+setOpen\(false, false\)/);
  assert.match(source, /installDrag\(panel, panel\.querySelector\("\.cm-head"\), "panelPosition"\)/);
  assert.match(source, /function syncPanelWithSiapDialog\(\)/);
  assert.match(source, /\[role="dialog"\], \.ui-dialog, \.modal-dialog, \.modal/);
  assert.doesNotMatch(source, /function render\(\)[\s\S]{0,2500}panel\.hidden\s*=/);
});

test('painel lateral libera o SIAP ao minimizar e volta ao reabrir', () => {
  const vm = require('node:vm');
  const section = source.slice(source.indexOf('  function restorePlanningDockTarget() {'), source.indexOf('  function installDrag('));
  const values = new Map([['margin-left', 'auto'], ['margin-right', 'auto']]);
  const style = {
    getPropertyValue: (name) => values.get(name) || '',
    getPropertyPriority: () => '',
    setProperty: (name, value) => values.set(name, value),
    removeProperty: (name) => values.delete(name)
  };
  const classes = new Set();
  const panel = {
    hidden:false,
    classList:{
      toggle(name, enabled){ if (enabled) classes.add(name); else classes.delete(name); },
      remove(name){ classes.delete(name); },
      contains(name){ return classes.has(name); }
    },
    getBoundingClientRect:()=>({ width:342, left:context.innerWidth - 365 })
  };
  const main = { style, scrollWidth:1014 };
  const context = {
    panel, document:{ querySelector:()=>main },
    Core:{ pageType:()=> 'planning-lesson' }, location:{ pathname:'/PlanejamentoProfessorPlanejamentoAulaEdicao.aspx' },
    innerWidth:1366
  };
  vm.createContext(context);
  vm.runInContext(`let planningDockTarget = null, planningDockOriginal = null, planningDockNaturalWidth = 0, planningDockDetached = false; ${section}; applyPlanningDockLayout()`, context);
  assert.equal(classes.has('cm-planning-docked'), true);
  assert.equal(values.get('width'), '1014px');
  assert.equal(values.get('margin-left'), '8px');
  assert.ok(Number(values.get('zoom')) < 1, 'o SIAP deve manter uma folga antes do painel');
  panel.hidden = true;
  vm.runInContext('applyPlanningDockLayout()', context);
  assert.equal(classes.has('cm-planning-docked'), false);
  assert.equal(values.get('margin-left'), 'auto');
  assert.equal(values.has('width'), false);
  assert.equal(values.has('zoom'), false);
  panel.hidden = false;
  context.innerWidth = 1080;
  vm.runInContext('applyPlanningDockLayout()', context);
  assert.equal(classes.has('cm-planning-docked'), true);
  assert.ok(Number(values.get('zoom')) < 1, 'em tela menor, o SIAP deve caber ao lado');
});

test('conteudo repete salvamento com limite seguro', () => {
  assert.match(source, /const MAX_SAVE_ATTEMPTS = 5/);
  assert.match(source, /batch\[retryKey\] >= MAX_SAVE_ATTEMPTS/);
  assert.match(source, /saveWaitStartedAt >= 20000/);
  assert.match(source, /O lote foi pausado/);
});

test('frequencia repete salvamento e pula data sem botao salvar', () => {
  assert.match(source, /batch\.attempts >= MAX_SAVE_ATTEMPTS/);
  assert.match(source, /if \(!save\) return skipUnavailableAttendanceDay/);
  assert.match(source, /o SIAP não apresentou botão de salvar/);
});

test('planejamento retenta salvamento incompleto com limite seguro', () => {
  assert.match(source, /if \(pendingBlock\)/);
  assert.match(source, /attempts >= MAX_SAVE_ATTEMPTS/);
  assert.match(source, /requestSiapPostBack\(pendingBlock\)/);
});

test('previa editavel e obrigatoria para aulas individuais', () => {
  assert.match(source, /async function startPlanningDraftPreview\(\)/);
  assert.match(source, /return startPlanningDraftPreview\(\)/);
  assert.match(source, /if \(preview\.draftsReady !== true\) return addLog/);
  assert.doesNotMatch(source, /if \(mode === "equivalent"\)[\s\S]{0,180}startPlanningDraftPreview/);
});

test('planejamento individual permite salvar e replicar automaticamente', () => {
  assert.match(source, /id="cm-plan-auto-save-replicate"/);
  assert.match(source, /function autoSaveAndReplicatePlanningIfRequested\(\)/);
  assert.match(source, /function openPlanningReplication\(\)/);
  assert.match(source, /sessionStorage\.setItem\("assistenteSiapConfirmReplicate", signature\)/);
  assert.match(source, /if \(!batch && contentFields\.length && autoSaveAndReplicatePlanningIfRequested\(\)\) return/);
  assert.match(source, /targets\.forEach\(\(input\) => \{[\s\S]{0,180}input\.checked = true/);
  assert.match(source, /if \(!inputs\.length\)[\s\S]{0,250}setTimeout\(completeReplicationIfRequested, 200\)/);
  assert.match(source, /Nenhuma turma compatível disponível[\s\S]{0,500}save\.click\(\)/);
});

test('replicação revisada abre antes de salvar e salva apenas a origem se não houver turmas', () => {
  const vm = require('node:vm');
  const section = source.slice(source.indexOf('  function savePlanning() {'), source.indexOf('  function generatePeiDraft() {'));
  let saved = 0, opened = 0;
  const data = new Map();
  const save = { disabled:false, click(){ saved++; } };
  const replicate = { disabled:false, click(){ opened++; } };
  const confirm = { disabled:false, click(){ throw Error('não deveria confirmar sem turma'); } };
  const dialog = { getClientRects:()=>[{}], querySelectorAll:()=>[{ disabled:true }] };
  const context = {
    document:{
      getElementById(id){ return ({ cphFuncionalidade_btnAlterar:save, cphFuncionalidade_cphCampos_btnReplicar:replicate, divTurmasReplicacao:dialog, cphFuncionalidade_cphCampos_btnConfirmarReplicar:confirm })[id] || null; },
      querySelector:()=>({})
    },
    panel:{ querySelector:()=>({ checked:true }) },
    sessionStorage:{ getItem:key=>data.get(key) || null, setItem:(key,value)=>data.set(key,value), removeItem:key=>data.delete(key) },
    planningSignature:()=> 'aula-atual', getPlanningBatch:()=>null, addLog:()=>{}, setTimeout:()=>{}
  };
  vm.createContext(context);
  vm.runInContext(section, context);
  vm.runInContext('savePlanning()', context);
  assert.equal(opened, 1);
  assert.equal(saved, 0, 'a aula não pode ser salva antes de abrir a replicação');
  vm.runInContext('completeReplicationIfRequested()', context);
  assert.equal(saved, 1, 'sem turma compatível, salva somente a aula atual');
});

test('PEI local usa textos desenvolvidos com aberturas diferentes', () => {
  assert.match(source, /Ao longo do período, foram desenvolvidas/);
  assert.match(source, /No trabalho com os objetos de conhecimento/);
  assert.match(source, /Para favorecer o acesso às aprendizagens/);
  assert.match(source, /O acompanhamento da aprendizagem ocorreu/);
  assert.match(source, /Como expectativa de aprendizagem, busca-se/);
  assert.match(source, /Em relação aos objetos de conhecimento/);
  assert.match(source, /Para viabilizar a participação e a aprendizagem/);
  assert.match(source, /O processo avaliativo será contínuo e formativo/);
});

test('minimização é preservada após sucessivos recarregamentos dos filtros', async () => {
  const vm = require('node:vm');
  const install = source.slice(source.indexOf('  async function install() {'), source.indexOf('  async function refreshLicenseStatus()'));
  let stored = {}, open;
  const context = {
    window:{addEventListener(){}}, applyPlanningDockLayout(){},
    initialPageType:'exam',
    chrome:{storage:{local:{get:async()=>({...stored})}}},
    removeCompetitorOverlap(){}, createShell(value){open=value;},
    setOpen(value){open=value;stored.panelOpen=value;},
    refreshLicenseStatus(){},refreshActivitySiteStatus(){},analyze(){},observeSiapUpdates(){},setTimeout(){}
  };
  vm.createContext(context);
  await vm.runInContext(install+';install()',context);
  assert.equal(open,true,'primeiro acesso pode abrir a correção');
  context.setOpen(false);
  for(let filter=0;filter<4;filter++){
    await vm.runInContext('install()',context);
    assert.equal(open,false,'trocar filtros mantém minimizado');
  }
  context.setOpen(true);
  await vm.runInContext('install()',context);
  assert.equal(open,true,'reabertura explícita também persiste');
});
