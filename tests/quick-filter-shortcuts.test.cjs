const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../services/siap-exam/node_modules/jsdom');

const source=fs.readFileSync(path.join(__dirname,'..','student-search-filters.js'),'utf8');

async function page(savedFavorites, canSeeOccurrences=true) {
  const dom=new JSDOM('<!doctype html><html><head></head><body><section class="panel"><div class="head"></div><div id="list"></div></section></body></html>',{runScripts:'dangerously'});
  const {window}=dom;
  window.classes=[];
  window.students=[
    {id:'1',report:'Não alfabetizado'},
    {id:'2',report:'Outra observação'}
  ];
  window.selectedClassId=null;
  window.selectedShift=null;
  window.permission={role:'admin'};
  window.esc=value=>String(value).replace(/[&<>"']/g,'');
  window.toast=()=>{};
  window.render=()=>{};
  window.getActiveSchoolId=()=> 'school-1';
  window.canViewOccurrences=()=>canSeeOccurrences;
  window.occurrenceStudentIds=new Set(['2']);
  window.studentHasPositiveLaudo=report=>report==='Outra observação';
  window.decodeObservationValues=report=>report?[report]:[];
  window.getSiapAttendanceStatus=id=>id==='1'?'absent':'active_search';
  window.db={from:table=>({
    select(){return this},order(){return this},eq(){return this},
    then(resolve){resolve({data:table==='observation_options'?[{id:'obs-1',label:'Outra observação'}]:[],error:null})},
    maybeSingle(){return Promise.resolve({data:savedFavorites,error:null})},
    upsert(payload){window.savedFavoritePayload=payload;return Promise.resolve({error:null})}
  })};
  if(window.document.readyState==='loading')
    await new Promise(resolve=>window.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  window.eval(source);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  for(let i=0;i<40&&window.document.querySelectorAll('#quickFavoriteFilters button').length<(canSeeOccurrences?6:5);i++)
    await new Promise(resolve=>setTimeout(resolve,10));
  return dom;
}

test('preferências antigas são completadas até seis filtros e Mais filtros fica por último',async()=>{
  const dom=await page({favorite_1:'laudo',favorite_2:'ocorrencia',favorite_3:'obsid:missing'});
  try {
    const {document}=dom.window;
    const labels=[...document.querySelectorAll('#quickFavoriteFilters button')].map(button=>button.textContent.replace(/\d+/g,'').trim());
    assert.deepEqual(labels,['Com laudo','Com ocorrência','Não alfabetizado','Faltoso','Busca ativa','Com observação']);
    assert.equal(document.querySelector('#quickFiltersRow').lastElementChild.id,'moreFiltersButton');
    assert.match(document.querySelector('style').textContent,/\.quick-filters-row \{ display:flex; flex-wrap:nowrap/);
    document.querySelector('[data-quick-filter="attendance:absent"]').click();
    assert.equal(document.querySelector('[data-quick-filter="attendance:absent"]').classList.contains('active'),true);
    assert.equal(dom.window.matchesQuickFilters(dom.window.students[0]),true);
    assert.equal(dom.window.matchesQuickFilters(dom.window.students[1]),false);
    document.getElementById('moreFiltersButton').click();
    assert.equal(document.querySelector('#moreFiltersPanel [data-filter-key="attendance:absent"]'),null);
  } finally {dom.window.close();}
});

test('favoritos padrão incluem seis atalhos sem duplicatas',async()=>{
  const dom=await page(null);
  try {
    const keys=[...dom.window.document.querySelectorAll('#quickFavoriteFilters button')].map(button=>button.dataset.quickFilter);
    assert.deepEqual(keys,['laudo','nao_alfabetizado','ocorrencia','attendance:absent','attendance:active_search','observation:any']);
    assert.equal(new Set(keys).size,keys.length);
  } finally {dom.window.close();}
});

test('configuração salva seis escolhas e oferece controles empilhados no celular',async()=>{
  const dom=await page(null);
  try {
    const {document}=dom.window;
    document.getElementById('moreFiltersButton').click();
    assert.match(document.querySelector('.quick-filter-settings summary').textContent,/Configurar filtros favoritos/);
    assert.match(document.querySelector('style').textContent,/@media\(max-width:600px\)/);
    assert.match(document.querySelector('style').textContent,/\.quick-filter-settings-actions \{ display:grid; grid-template-columns:minmax\(0,1fr\)/);
    const remove=document.querySelector('[data-favorite-choice="observation:any"]');
    remove.checked=false;
    remove.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    const add=document.querySelector('[data-favorite-choice="obsid:obs-1"]');
    assert.equal(add.disabled,false);
    add.checked=true;
    add.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    document.querySelector('[data-save-favorites]').click();
    for(let i=0;i<20&&!dom.window.savedFavoritePayload;i++)
      await new Promise(resolve=>setTimeout(resolve,10));
    for(let i=0;i<20&&!document.querySelector('[data-quick-filter="obs:Outra observação"]');i++)
      await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(dom.window.savedFavoritePayload.favorite_1,'laudo');
    assert.equal(dom.window.savedFavoritePayload.favorite_6,'obsid:obs-1');
    assert.ok(document.querySelector('[data-quick-filter="obs:Outra observação"]'));
    assert.equal(document.querySelectorAll('#quickFavoriteFilters button').length,6);
  } finally {dom.window.close();}
});

test('filtro de ocorrência salvo reaparece quando a permissão é restaurada',async()=>{
  const dom=await page({favorite_1:'laudo',favorite_2:'nao_alfabetizado',favorite_3:'attendance:absent',favorite_4:'attendance:active_search',favorite_5:'observation:any',favorite_6:'ocorrencia'},false);
  try {
    const {document}=dom.window;
    assert.equal(document.querySelector('[data-quick-filter="ocorrencia"]'),null);
    assert.equal(document.querySelectorAll('#quickFavoriteFilters button').length,5);
    dom.window.canViewOccurrences=()=>true;
    document.dispatchEvent(new dom.window.Event('carometro:permission-refresh'));
    assert.ok(document.querySelector('[data-quick-filter="ocorrencia"]'));
    assert.equal(document.querySelectorAll('#quickFavoriteFilters button').length,6);
  } finally {dom.window.close();}
});
