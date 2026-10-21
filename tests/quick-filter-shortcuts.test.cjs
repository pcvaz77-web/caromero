const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('../services/siap-exam/node_modules/jsdom');

const source=fs.readFileSync(path.join(__dirname,'..','student-search-filters.js'),'utf8');

async function page(savedFavorites) {
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
  window.render=()=>{};
  window.getActiveSchoolId=()=> 'school-1';
  window.canViewOccurrences=()=>true;
  window.occurrenceStudentIds=new Set(['2']);
  window.studentHasPositiveLaudo=report=>report==='Outra observação';
  window.decodeObservationValues=report=>report?[report]:[];
  window.getSiapAttendanceStatus=id=>id==='1'?'absent':'active_search';
  window.db={from:table=>({
    select(){return this},order(){return this},eq(){return this},
    then(resolve){resolve({data:table==='observation_options'?[{id:'obs-1',label:'Outra observação'}]:[],error:null})},
    maybeSingle(){return Promise.resolve({data:savedFavorites,error:null})}
  })};
  if(window.document.readyState==='loading')
    await new Promise(resolve=>window.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  window.eval(source);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  for(let i=0;i<40&&window.document.querySelectorAll('#quickFavoriteFilters button').length<5;i++)
    await new Promise(resolve=>setTimeout(resolve,10));
  return dom;
}

test('três atalhos adicionais aparecem na mesma fileira e Mais filtros fica por último',async()=>{
  const dom=await page({favorite_1:'laudo',favorite_2:'ocorrencia',favorite_3:'obsid:missing'});
  try {
    const {document}=dom.window;
    const labels=[...document.querySelectorAll('#quickFavoriteFilters button')].map(button=>button.textContent.replace(/\d+/g,'').trim());
    assert.deepEqual(labels,['Com laudo','Com ocorrência','Não alfabetizado','Faltoso','Busca ativa']);
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

test('favoritos padrão recebem três atalhos sem duplicar os existentes',async()=>{
  const dom=await page(null);
  try {
    const keys=[...dom.window.document.querySelectorAll('#quickFavoriteFilters button')].map(button=>button.dataset.quickFilter);
    assert.deepEqual(keys,['laudo','nao_alfabetizado','ocorrencia','attendance:absent','attendance:active_search','observation:any']);
    assert.equal(new Set(keys).size,keys.length);
  } finally {dom.window.close();}
});
