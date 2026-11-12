const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const reader=fs.readFileSync(path.join(__dirname,'..','extensions','carometro-frequencia-leitura','content.js'),'utf8');

function snapshot({classic=false,mismatch=false,malformed=false,invalidHours=false}={}){
  const names=['1. ANA EXEMPLO','2. BRUNO EXEMPLO'];
  const students=names.map((textContent,index)=>({dataset:{matricula:String(index+1)},textContent}));
  const absenceCells=['0',malformed?'2,5':'3'].map((textContent,index)=>({
    dataset:{matricula:String(mismatch&&index===1?9:index+1),bloqueado:'False'},textContent
  }));
  const absenceList={querySelector:()=>({textContent:' Faltas '}),querySelectorAll:()=>absenceCells};
  const finalList={querySelector:()=>({textContent:' Média Bimestral Final '}),querySelectorAll:()=>[]};
  const classicTable={rows:[
    {cells:['Alunos','Faltas','Notas Finais'].map(textContent=>({textContent}))},
    {cells:['1. ANA EXEMPLO','0','8,0'].map(textContent=>({textContent}))},
    {cells:['2. BRUNO EXEMPLO',malformed?'2,5':'3','7,0'].map(textContent=>({textContent}))}
  ]};
  const fields={
    cphFuncionalidade_cphCampos_txtAnoLetivo:'2026',
    cphFuncionalidade_cphCampos_txtComposicao:'199 - Ensino Fundamental',
    cphFuncionalidade_cphCampos_txtSerie:'6º Ano',
    cphFuncionalidade_cphCampos_txtTurno:'Vespertino',
    cphFuncionalidade_cphCampos_txtDisciplina:'55 - EDUCAÇÃO FÍSICA',
    cphFuncionalidade_cphCampos_txtTurma:'6D',
    cphFuncionalidade_cphCampos_txtBimestre:'4º Bimestre',
    lblNomeEntidade:'Col Est Escola Exemplo'
  };
  const hourInputs=[
    {id:'txtCargaHorariaPrevista',value:'17'},
    {id:'txtCargaHorariaMinistrada',value:invalidHours?'0':'8'}
  ];
  const context={
    performance:{timeOrigin:1},crypto:{randomUUID:()=> 'test'},
    location:{pathname:classic?'/NotasEdicao.aspx':'/NotasModeloEdicao.aspx'},
    document:{
      getElementById:id=>fields[id]?{value:fields[id],textContent:fields[id]}:null,
      querySelectorAll:selector=>selector==='input'?hourInputs:
        selector==='label,span,div'?[]:selector==='table'?(classic?[classicTable]:[]):
        selector.includes('listaDeAlunos')?students:
        selector.includes('listaDeTotais')?[absenceList,finalList]:[]
    }
  };
  vm.runInNewContext(reader,context);
  return context.__carometroAbsencesSnapshot;
}

for(const classic of [false,true]){
  test(`lê zero e faltas parciais na aba Notas ${classic?'clássica':'modelo'}`,()=>{
    const result=snapshot({classic})();
    assert.equal(result.context.term,'4º Bimestre');
    assert.equal(result.taughtHours,8);
    assert.equal(result.plannedHours,17);
    assert.deepEqual(Array.from(result.entries,item=>item.absences),[0,3]);
    assert.deepEqual(Array.from(result.entries,item=>item.name),['ANA EXEMPLO','BRUNO EXEMPLO']);
  });
  test(`rejeita faltas fracionárias na aba Notas ${classic?'clássica':'modelo'}`,()=>{
    assert.throws(()=>snapshot({classic,malformed:true})(),/faltas em formato desconhecido/);
  });
}

test('interrompe a tela modelo quando as matrículas não coincidem',()=>{
  assert.throws(()=>snapshot({mismatch:true})(),/ordem das faltas/);
});

test('não calcula frequência sem carga horária ministrada positiva',()=>{
  assert.throws(()=>snapshot({invalidHours:true})(),/maior que zero/);
});
