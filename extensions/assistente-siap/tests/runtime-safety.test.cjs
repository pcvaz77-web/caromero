const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');

test('estado visual persiste independente da execucao', () => {
  assert.match(source, /createShell\(stored\.panelOpen === true, false, stored\)/);
  assert.match(source, /data-action="minimize"[^\n]+setOpen\(false, false\)/);
  assert.doesNotMatch(source, /function render\(\)[\s\S]{0,2500}panel\.hidden\s*=/);
});

test('conteudo repete salvamento com limite seguro', () => {
  assert.match(source, /const MAX_SAVE_ATTEMPTS = 5/);
  assert.match(source, /batch\.saveAttempts >= MAX_SAVE_ATTEMPTS/);
  assert.match(source, /saveWaitStartedAt >= 20000/);
  assert.match(source, /O lote foi pausado/);
});

test('frequencia repete salvamento e pula data sem botao salvar', () => {
  assert.match(source, /batch\.attempts >= MAX_SAVE_ATTEMPTS/);
  assert.match(source, /if \(!save\) return skipUnavailableAttendanceDay/);
  assert.match(source, /o SIAP não apresentou botão de salvar/);
});

test('planejamento reabre o bloco e repete salvamento com limite seguro', () => {
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
  assert.match(source, /if \(!batch && autoSaveAndReplicatePlanningIfRequested\(\)\) return/);
  assert.match(source, /targets\.forEach\(\(input\) => \{[\s\S]{0,180}input\.checked = true/);
  assert.match(source, /if \(!inputs\.length\)[\s\S]{0,250}setTimeout\(completeReplicationIfRequested, 200\)/);
  assert.match(source, /cphFuncionalidade_cphCampos_btnCancelarReplicar/);
  assert.match(source, /Nenhuma turma compatível disponível[\s\S]{0,500}save\.click\(\)/);
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
    initialPageType:'exam',
    chrome:{storage:{local:{get:async()=>({...stored})}}},
    removeCompetitorOverlap(){}, createShell(value){open=value;},
    setOpen(value){open=value;stored.panelOpen=value;},
    refreshLicenseStatus(){},analyze(){},observeSiapUpdates(){},setTimeout(){}
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
