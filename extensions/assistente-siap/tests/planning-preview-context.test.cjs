const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/content.js'), 'utf8');
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

test('turmas equivalentes compartilham a prévia somente com a mesma seleção curricular', () => {
  const helpers = between('function normalizePlanningGroup(', 'function planningOverviewOptions(');
  const key = vm.runInNewContext(`${helpers}\nplanningCurriculumKey`);
  const base = { thematicUnit:'Leitura', selectedSkills:['EF69LP02'], selectedContents:['Estratégias de leitura'], saebAvailable:true, selectedSaeb:['D6 - Identificar o tema de um texto.'] };
  assert.equal(key(base), key({ thematicUnit:' leitura ', selectedSkills:['EF69LP02'], selectedContents:['Estratégias de leitura'], saebAvailable:true, selectedSaeb:[' D6 - Identificar o tema de um texto. '] }));
  assert.notEqual(key(base), key({ ...base, selectedContents:['Fundamentos técnicos'] }));
  assert.notEqual(key(base), key({ ...base, selectedSkills:['EF06EF07'] }));
  assert.notEqual(key(base), key({ ...base, selectedSaeb:['D1 - Localizar informações explícitas em um texto.'] }));
  assert.notEqual(key(base), key({ ...base, saebAvailable:false, selectedSaeb:[] }));
});

test('lê apenas o descritor selecionado na Matriz SAEB, sem confundir com as opções da árvore', () => {
  const selected = { innerText:'D6 - Identificar o tema de um texto.' };
  const container = { querySelectorAll:()=>[selected] };
  const document = { querySelector:(selector)=> selector === '#conteudomatrizsaebs .itens' ? container : null };
  const read = vm.runInNewContext(`${between('function selectedPlanningSaeb(', 'function tryNextPlanningAxis(')}\nselectedPlanningSaeb`, { document });
  assert.deepEqual(Array.from(read()), ['D6 - Identificar o tema de um texto.']);
  selected.innerText = ' ';
  assert.deepEqual(Array.from(read()), []);
});

test('reconhece os links de descritores SAEB da árvore do SIAP', () => {
  const links = [
    { getAttribute:()=>"javascript:__doPostBack('ctl00$ctl00$cphFuncionalidade$cphCampos$treeView','sMatriz%20SAEB%5C%5C118')" },
    { getAttribute:()=>"javascript:__doPostBack('ctl00$ctl00$cphFuncionalidade$cphCampos$treeView','sHabilidades%5C%5C98385')" },
  ];
  const document = { querySelectorAll:()=>links };
  const find = vm.runInNewContext(`${between('function planningLinks(', 'function selectedPlanningSaeb(')}\nplanningLinks`, { document, decodeURIComponent });
  assert.deepEqual(Array.from(find('saeb')), [links[0]]);
});

test('seleciona Matriz SAEB somente quando há opções e nenhuma seleção manual', () => {
  const storage = new Map([['assistenteSiapPlanningFlow', JSON.stringify({ signature:'aula-114', stage:'fill', lockedAxis:true })]]);
  const selected = [];
  let requested = 0;
  let generated = 0;
  const context = {
    Core:{ pageType:()=> 'planning-lesson' }, location:{ pathname:'/PlanejamentoProfessorPlanejamentoAulaEdicao.aspx' },
    sessionStorage:{ getItem:(key)=>storage.get(key) || null, setItem:(key,value)=>storage.set(key,value), removeItem:(key)=>storage.delete(key) },
    planningSignature:()=> 'aula-114', getPlanningBatch:()=>null,
    document:{ getElementById:()=>({ value:'114' }), querySelectorAll:()=>[] },
    planningLinks:(kind)=>kind === 'saeb' ? [{ id:'D6' }] : [],
    selectedPlanningSaeb:()=>selected,
    requestSiapPostBack:()=>{ requested++; return true; },
    generatePlanningDraft:()=>{ generated++; }, stopPlanningFlow:()=>{},
  };
  const resume = vm.runInNewContext(`${between('function resumePlanningFlow(', 'function stopPlanningFlow(')}\nresumePlanningFlow`, context);
  resume();
  assert.equal(requested, 1);
  assert.equal(generated, 0);
  assert.equal(JSON.parse(storage.get('assistenteSiapPlanningFlow')).stage, 'wait-saeb');
  selected.push('D6 - Identificar o tema de um texto.');
  resume();
  assert.equal(requested, 1);
  assert.equal(generated, 1);
  storage.set('assistenteSiapPlanningFlow', JSON.stringify({ signature:'aula-114', stage:'fill', lockedAxis:true }));
  resume();
  assert.equal(requested, 1);
  assert.equal(generated, 2);
  selected.length = 0;
  context.planningLinks = () => [];
  storage.set('assistenteSiapPlanningFlow', JSON.stringify({ signature:'aula-114', stage:'fill', lockedAxis:true }));
  resume();
  assert.equal(requested, 1);
  assert.equal(generated, 3);
});

test('a prévia abre os quadradinhos antes de gerar IA e nunca salva durante a leitura', () => {
  const preview = between('async function startPlanningDraftPreview(', 'function buildPlanningPreview(');
  const generation = between('async function generatePlanningAiDraft(', 'function savePlanning(');
  assert.match(preview, /previewOnly:true/);
  assert.match(preview, /selectedQueue:preview\.queue/);
  assert.doesNotMatch(preview, /ASSISTENTE_SIAP_AI_DRAFT/);
  assert.ok(generation.indexOf('selectedSkills') < generation.indexOf('ASSISTENTE_SIAP_AI_DRAFT'));
  assert.ok(generation.indexOf('selectedContents') < generation.indexOf('ASSISTENTE_SIAP_AI_DRAFT'));
  assert.ok(generation.indexOf('batch.previewOnly') < generation.indexOf('contentFields.forEach'));
  assert.match(generation, /template\.curriculumKey !== curriculumKey/);
  assert.match(generation, /currentBatch\.runId !== batch\.runId/);
});

test('a unidade Danças escolhida pelo professor permanece fixa quando não há conteúdo no bimestre', () => {
  const storage = new Map();
  const sessionStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const axis = { value:'dancas', selectedOptions:[{ textContent:'Danças' }], options:[{ value:'dancas' }, { value:'esportes' }] };
  const document = {
    getElementById: (id) => id === 'ddlEixo' ? axis : null,
    querySelectorAll: (selector) => selector.includes('gdvExpectativas') ? [{ textContent:'Criar sequências coreográficas' }] : [],
  };
  const context = { sessionStorage, document, Core:{ pageType:()=> 'planning-lesson' }, location:{ pathname:'/PlanejamentoProfessorPlanejamentoAulaEdicao.aspx' }, model:{}, panel:{ querySelector:()=>null }, readContext:()=>({}), getPlanningBatch:()=>null, planningSignature:()=> 'aula-55', readStoredJson:(key)=>JSON.parse(sessionStorage.getItem(key) || 'null'), selectedPlanningSaeb:()=>[], updateOperationStatus:()=>{}, resumePlanningFlow:()=>{} };
  const start = vm.runInNewContext(`${between('function startPlanningFlow(', 'function resumePlanningFlow(')}\nstartPlanningFlow`, context);
  start('ai');
  const flow = JSON.parse(sessionStorage.getItem('assistenteSiapPlanningFlow'));
  assert.equal(flow.stage, 'content');
  assert.equal(flow.lockedAxis, true);
  const nextAxis = vm.runInNewContext(`${between('function tryNextPlanningAxis(', 'function startPlanningFlow(')}\ntryNextPlanningAxis`, { document, sessionStorage, Core:{ unique:(items)=>[...new Set(items)] } });
  assert.equal(nextAxis(flow), false);
  assert.equal(axis.value, 'dancas');
  let generated = false;
  context.planningLinks = () => [];
  context.generatePlanningAiDraft = () => { generated = true; };
  context.addLog = () => {};
  context.updateOperationStatus = () => {};
  context.readContext = () => ({});
  context.Core.pageType = () => 'planning-lesson';
  context.document.getElementById = (id) => id === 'ddlEixo' ? axis : id === 'cphFuncionalidade_cphCampos_txtNumeroAula' ? { value:'55' } : null;
  const resume = vm.runInNewContext(`${between('function resumePlanningFlow(', 'function stopPlanningFlow(')}\nresumePlanningFlow`, context);
  resume();
  assert.equal(generated, true);
  assert.equal(axis.value, 'dancas');
});

test('sem escolha manual, o assistente pode procurar uma unidade com opções curriculares', () => {
  const axis = { value:'dancas', options:[{ value:'dancas' }, { value:'esportes' }], dispatchEvent:()=>{} };
  const context = { document:{ getElementById:()=>axis }, sessionStorage:{ setItem:()=>{} }, Core:{ unique:(items)=>[...new Set(items)] }, Event:class {} };
  const nextAxis = vm.runInNewContext(`${between('function tryNextPlanningAxis(', 'function startPlanningFlow(')}\ntryNextPlanningAxis`, context);
  assert.equal(nextAxis({ lockedAxis:false }), true);
  assert.equal(axis.value, 'esportes');
});

test('aula individual e quinzena completam zero, algumas ou todas as escolhas curriculares', () => {
  for (const batchMode of [false, true]) {
    for (const initial of [[], ['skill'], ['content'], ['skill', 'content'], ['skill', 'content', 'saeb']]) {
      const selected = new Set(initial);
      const storage = new Map();
      const requested = [];
      let generated = 0;
      const axis = { value:'leitura', options:[{ value:'leitura' }], selectedOptions:[{ textContent:'Leitura' }] };
      const batch = batchMode ? { active:true, current:{ sequenceIndex:0 } } : null;
      const document = {
        getElementById:(id)=>id === 'ddlEixo' ? axis : id === 'cphFuncionalidade_cphCampos_txtNumeroAula' ? { value:'1' } : null,
        querySelectorAll:(selector)=>selector.includes('gdvExpectativas') ? (selected.has('skill') ? [{}] : [])
          : selector.includes('lstConteudos_divConteudo_') ? (selected.has('content') ? [{}] : []) : [],
      };
      const sessionStorage = {
        getItem:(key)=>storage.get(key) || null,
        setItem:(key,value)=>storage.set(key,value),
        removeItem:(key)=>storage.delete(key),
      };
      const context = {
        Core:{ pageType:()=> 'planning-lesson' }, location:{ pathname:'/PlanejamentoProfessorPlanejamentoAulaEdicao.aspx' },
        sessionStorage, document, model:{}, panel:{ querySelector:()=>null }, readContext:()=>({}),
        getPlanningBatch:()=>batch, planningSignature:()=> 'aula-1', readStoredJson:()=>null,
        selectedPlanningSaeb:()=>selected.has('saeb') ? ['D6 - Identificar o tema de um texto.'] : [],
        planningLinks:(kind)=>[{ kind }], updateOperationStatus:()=>{}, addLog:()=>{},
        requestSiapPostBack:(link)=>{ requested.push(link.kind); selected.add(link.kind); return true; },
        generatePlanningAiDraft:()=>{ generated++; }, stopPlanningFlow:(message)=>{ throw Error(message); },
      };
      const flow = vm.runInNewContext(`${between('function startPlanningFlow(', 'function stopPlanningFlow(')}\n({ startPlanningFlow, resumePlanningFlow })`, context);
      flow.startPlanningFlow('ai');
      for (let index = 0; index < 4 && storage.has('assistenteSiapPlanningFlow'); index++) flow.resumePlanningFlow();
      assert.equal(generated, 1, `gera: batch=${batchMode}, escolhas=${initial.join(',')}`);
      assert.deepEqual(requested, ['skill', 'content', 'saeb'].filter((kind)=>!initial.includes(kind)), `completa apenas ausentes: batch=${batchMode}, escolhas=${initial.join(',')}`);
      for (const kind of initial) assert.ok(selected.has(kind), `preserva ${kind}`);
      assert.equal(axis.value, 'leitura');
    }
  }
});

test('a IA usa Danças e a habilidade presente, e substitui textos anteriores sem trocar o assunto', async () => {
  class TextArea { constructor(value) { this.value = value; } dispatchEvent() {} }
  const methodology = new TextArea('Texto antigo sobre esportes.');
  const evaluation = new TextArea('Avaliação antiga.');
  const captured = [];
  const document = {
    getElementById: (id) => ({
      cphFuncionalidade_cphCampos_txtMetodologia:methodology,
      cphFuncionalidade_cphCampos_txtAvaliacao:evaluation,
      cphFuncionalidade_cphCampos_txtNumeroAula:{ value:'55' },
      ddlEixo:{ selectedOptions:[{ textContent:'Danças' }] },
    })[id] || null,
    querySelectorAll: (selector) => selector.includes('gdvExpectativas') ? [{ textContent:'Criar sequências coreográficas' }] : [],
  };
  const context = {
    document, HTMLTextAreaElement:TextArea, Event:class {},
    sessionStorage:{ removeItem:()=>{} }, getPlanningBatch:()=>null,
    model:{ context:{ grade:'6º Ano', subject:'EDUCAÇÃO FÍSICA', term:'3º Bimestre' } },
    planningCurriculumKey:()=> 'dancas', selectedPlanningSaeb:()=>[], planningLinks:()=>[], setOperationStatus:()=>{}, addLog:()=>{},
    autoSaveAndReplicatePlanningIfRequested:()=>{ throw new Error('não deve salvar sem conteúdo selecionado'); },
    chrome:{ runtime:{ sendMessage:async ({ payload }) => {
      captured.push(payload);
      return { ok:true, fields:['Objetivo', 'Descrição', 'Explorar movimentos de dança.', 'Observar a composição coreográfica.'] };
    } } },
  };
  const generate = vm.runInNewContext(`${between('async function generatePlanningAiDraft(', 'function savePlanning(')}\ngeneratePlanningAiDraft`, context);
  await generate(JSON.stringify({ guidance:'Aula apenas expositiva; avaliação curta.' }));
  assert.equal(captured.length, 1);
  assert.equal(captured[0].thematicUnit, 'Danças');
  assert.deepEqual(Array.from(captured[0].selectedSkills), ['Criar sequências coreográficas']);
  assert.equal(captured[0].guidance, 'Aula apenas expositiva; avaliação curta.');
  assert.equal(methodology.value, 'Explorar movimentos de dança.');
  assert.equal(evaluation.value, 'Observar a composição coreográfica.');
  context.selectedPlanningSaeb = () => ['D6 - Identificar o tema de um texto.'];
  context.planningLinks = () => [{ id:'descritor-D6' }];
  context.model.context.subject = 'LÍNGUA PORTUGUESA';
  document.getElementById = (id) => id === 'ddlEixo' ? { selectedOptions:[{ textContent:'Leitura' }] } : ({
    cphFuncionalidade_cphCampos_txtMetodologia:methodology,
    cphFuncionalidade_cphCampos_txtAvaliacao:evaluation,
    cphFuncionalidade_cphCampos_txtNumeroAula:{ value:'114' },
  })[id] || null;
  await generate('{}');
  assert.deepEqual(Array.from(captured[1].selectedSaeb), ['D6 - Identificar o tema de um texto.']);
  assert.equal(captured[1].saebAvailable, true);
  assert.match(captured[1].educationalContext, /Matriz SAEB.*D6/);
});
