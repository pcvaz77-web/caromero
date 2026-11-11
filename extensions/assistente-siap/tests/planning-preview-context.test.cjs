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
    generatePlanningDraft:()=>{ generated++; }, stopPlanningFlow:()=>{}, schedulePlanningResume:()=>{},
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

test('sequência aplica o descritor SAEB exato da prévia e rejeita escolha divergente', () => {
  const expected = 'D6 - Identificar o tema de um texto.';
  const links = [{ textContent:'D1 - Localizar informações explícitas.' }, { textContent:expected }];
  const selected = [], requested = [], messages = [];
  const storage = new Map([['assistenteSiapPlanningFlow', JSON.stringify({ signature:'aula-127', stage:'fill', lockedAxis:true })]]);
  const batch = { mode:'lesson-sequence', current:{ sequenceIndex:0, saeb:[expected] } };
  let generated = 0;
  const context = {
    Core:{ pageType:()=> 'planning-lesson' }, location:{ pathname:'/PlanejamentoProfessorPlanejamentoAulaEdicao.aspx' },
    sessionStorage:{ getItem:(key)=>storage.get(key) || null, setItem:(key,value)=>storage.set(key,value), removeItem:(key)=>storage.delete(key) },
    planningSignature:()=> 'aula-127', getPlanningBatch:()=>batch,
    document:{ getElementById:()=>({ value:'127' }), querySelectorAll:()=>[] },
    planningLinks:(kind)=>kind === 'saeb' ? links : [], selectedPlanningSaeb:()=>selected,
    normalizePlanningGroup:(value)=>String(value || '').replace(/\s+/g, ' ').trim().toUpperCase(),
    requestSiapPostBack:(link)=>{ requested.push(link.textContent); return true; },
    generatePlanningDraft:()=>{ generated++; }, stopPlanningFlow:(message)=>{ messages.push(message); }, schedulePlanningResume:()=>{},
  };
  const code = `${between('function samePlanningChoices(', 'function lessonMultiPreviewIsCurrent(')}\n${between('function planningLinkForChoice(', 'function lessonSequenceMissingChoices(')}\n${between('function resumePlanningFlow(', 'function stopPlanningFlow(')}\nresumePlanningFlow`;
  const resume = vm.runInNewContext(code, context);
  resume();
  assert.deepEqual(requested, [expected]);
  selected.push(expected);
  resume();
  assert.equal(generated, 1);
  selected[0] = links[0].textContent;
  storage.set('assistenteSiapPlanningFlow', JSON.stringify({ signature:'aula-127', stage:'fill', lockedAxis:true }));
  resume();
  assert.equal(generated, 1);
  assert.match(messages.at(-1), /Matriz SAEB.*difere da prévia/);
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

test('orientações curtas já digitadas viram botões ativos sem permanecer na caixa de sugestão', () => {
  class TextArea { constructor() { this.value=''; } }
  const context = {
    document:{ getElementById:()=>new TextArea(), querySelectorAll:()=>[] },
    model:{},
    HTMLTextAreaElement:TextArea, selectedPlanningSaeb:()=>[], planningLinks:()=>[], getPlanningBatch:()=>null,
    planningSignature:()=> 'aula-63',
    readStoredJson:()=>({ signature:'aula-63', value:'Faça a metodologia curta e sucinta.\nFaça a avaliação curta e sucinta.' }),
    getLessonMultiPreview:()=>null, lessonMultiPreviewCard:()=>'', lessonMultiPreviewDetails:()=>'', lessonMultiPreviewIsCurrent:()=>false, planningObjectiveTopics:()=>[], revisaSkillPicker:()=>'',
    escapeHtml:(value)=>value,
  };
  const card = vm.runInNewContext(`${between('function planningLessonCard(', 'function peiCard(')}\nplanningLessonCard`, context)();
  assert.match(card, /data-plan-option="conciseMethodology" aria-pressed="true"/);
  assert.match(card, /data-plan-option="conciseEvaluation" aria-pressed="true"/);
  assert.doesNotMatch(card, /<textarea id="cm-plan-guidance"[^>]*>Faça/);
  assert.doesNotMatch(card, /data-action="plan-apply-save"/);
  assert.doesNotMatch(card, /Gerar com IA/);
  context.getLessonMultiPreview = () => ({ plans:[{ lesson:63 }] });
  context.lessonMultiPreviewIsCurrent = () => true;
  const withPreview = vm.runInNewContext(`${between('function planningLessonCard(', 'function peiCard(')}\nplanningLessonCard`, context)();
  assert.match(withPreview, /data-action="plan-apply-save"/);
  assert.match(withPreview, /data-action="plan-apply-replicate"/);
});

test('explicação do botão permanece dentro da tela perto da borda direita', () => {
  const tip = { style:{}, setAttribute:()=>{}, getBoundingClientRect:()=>({ width:290, height:80 }), remove:()=>{} };
  let appended;
  const context = {
    document:{ createElement:()=>tip, documentElement:{ append:(item)=>{ appended = item; } } },
    innerWidth:500, innerHeight:750,
  };
  const helpers = source.slice(source.indexOf('  function hidePlanningTooltip() {'), source.indexOf('  window.addEventListener("scroll", hidePlanningTooltip'));
  const show = vm.runInNewContext(`let planningTooltip; ${helpers}\nshowPlanningTooltip`, context);
  show({ disabled:false, dataset:{ tip:'Detalhes da avaliação.' }, getBoundingClientRect:()=>({ left:460, top:670, bottom:700 }) });
  assert.equal(appended, tip);
  assert.equal(tip.style.left, '198px');
  assert.equal(tip.style.top, '582px');
});

test('opções de texto alternam e botões finais executam diretamente', () => {
  class Button {
    constructor() { this.attributes = new Map([['aria-pressed', 'false']]); this.listeners = new Map(); this.disabled = false; }
    getAttribute(name) { return this.attributes.get(name) || null; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    click() { if (!this.disabled) this.listeners.get('click')?.({ currentTarget:this }); }
  }
  const format = new Button(), evaluation = new Button();
  const ai = new Button(), local = new Button(), save = new Button(), replicate = new Button();
  let applied = [];
  const controls = {
    '[data-plan-option="conciseMethodology"]':format,
    '[data-plan-option="conciseEvaluation"]':evaluation,
    '[data-action="plan-ai-draft"]':ai,
    '[data-action="plan-draft"]':local,
    '[data-action="plan-apply-save"]':save,
    '[data-action="plan-apply-replicate"]':replicate,
  };
  const storage = new Map();
  const context = {
    panel:{ querySelector:(selector)=>controls[selector] || null, querySelectorAll:(selector)=>selector === '.cm-plan-option' || selector === '[data-plan-option]' ? [format,evaluation] : [] },
    sessionStorage:{ setItem:(key,value)=>storage.set(key,value), removeItem:(key)=>storage.delete(key) },
    planningSignature:()=> 'aula-63', hidePlanningTooltip:()=>{}, showPlanningTooltip:()=>{}, applyReviewedPlanning:(value)=>applied.push(value),
  };
  const bind = vm.runInNewContext(`${between('function bindPanelEvents(', 'async function startContentBatch(')}\nbindPanelEvents`, context);
  bind();
  for (const option of [format,evaluation]) {
    option.click();
    assert.equal(option.getAttribute('aria-pressed'), 'true');
    assert.equal(option.disabled, false);
  }
  save.click(); replicate.click();
  assert.deepEqual(applied, [false, true]);
  for (const option of [format,evaluation]) {
    option.click();
    assert.equal(option.getAttribute('aria-pressed'), 'false');
    assert.equal(option.disabled, false);
  }
  assert.equal(save.getAttribute('aria-pressed'), 'false');
  assert.equal(ai.disabled, false);
  assert.equal(local.disabled, false);
  assert.equal(save.disabled, false);
  assert.equal(storage.has('assistenteSiapAutoSaveReplicate'), false);
  assert.equal(JSON.parse(storage.get('assistenteSiapPlanningGuidanceDraft')).conciseMethodology, false);
  assert.equal(JSON.parse(storage.get('assistenteSiapPlanningGuidanceDraft')).conciseEvaluation, false);
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

test('habilidade e conteúdo são repetidos uma vez, sem salvar quando o SIAP não confirma', () => {
  for (const kind of ['skill','content']) {
    const state = { signature:'aula-55', stage:kind === 'skill' ? 'wait-skill' : 'wait-content', lockedAxis:true, waitStartedAt:Date.now() - 16000 };
    const storage = new Map([['assistenteSiapPlanningFlow', JSON.stringify(state)]]);
    const link = { id:kind };
    const requested = [];
    let error = '';
    let generated = 0;
    const context = {
      Core:{ pageType:()=> 'planning-lesson' }, location:{ pathname:'/PlanejamentoProfessorPlanejamentoAulaEdicao.aspx' },
      sessionStorage:{ getItem:(key)=>storage.get(key) || null, setItem:(key,value)=>storage.set(key,value), removeItem:(key)=>storage.delete(key) },
      planningSignature:()=> 'aula-55', getPlanningBatch:()=>null,
      document:{ getElementById:()=>({ value:'55' }), querySelectorAll:()=>[] },
      selectedPlanningSkills:()=>[], planningLinks:(choice)=>choice === kind ? [link] : [],
      planningLinkForChoice:(links)=>links[0], requestSiapPostBack:(choice)=>{ requested.push(choice); return true; },
      addLog:()=>{}, tryNextPlanningAxis:()=>false,
      stopPlanningFlow:(message)=>{ error = message; }, schedulePlanningResume:()=>{},
      generatePlanningDraft:()=>{ generated++; },
    };
    const resume = vm.runInNewContext(`${between('function retryPlanningSelection(', 'function startPlanningFlow(')}\n${between('function resumePlanningFlow(', 'function stopPlanningFlow(')}\nresumePlanningFlow`, context);
    resume();
    assert.equal(requested.length, 1);
    assert.equal(error, '');
    const retry = JSON.parse(storage.get('assistenteSiapPlanningFlow'));
    assert.equal(retry.selectionRetryCount, 1);
    retry.waitStartedAt = Date.now() - 16000;
    storage.set('assistenteSiapPlanningFlow', JSON.stringify(retry));
    resume();
    assert.equal(requested.length, 1);
    assert.match(error, /não foi confirmad[oa]/);
    assert.equal(generated, 0);
  }
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
        planningLinks:(kind)=>[{ kind }], planningLinkForChoice:(links)=>links[0], selectedPlanningSkills:()=>selected.has('skill') ? ['Habilidade'] : [],
        retryPlanningSelection:()=>false, updateOperationStatus:()=>{}, addLog:()=>{}, schedulePlanningResume:()=>{},
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
    planningCurriculumKey:()=> 'dancas', normalizePlanningGroup:(value)=>String(value || '').toUpperCase(), selectedPlanningSaeb:()=>[], planningLinks:()=>[], concisePlanningText:(value)=>value, conciseMethodologyText:(value)=>value, setOperationStatus:()=>{}, addLog:()=>{}, setTimeout, clearTimeout,
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
  assert.equal(captured[0].guidance, 'Aula apenas expositiva; avaliação curta. Escreva a metodologia em até três frases e 45 palavras.');
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
  await generate(JSON.stringify({ guidance:'Usar projetor.', conciseMethodology:true, conciseEvaluation:true }));
  assert.equal(captured[2].guidance, 'Usar projetor. Escreva a metodologia em até três frases e 30 palavras. Faça a avaliação curta e sucinta.');
  assert.equal(captured[2].conciseMethodology, true);
  assert.equal(captured[2].conciseEvaluation, true);
});
