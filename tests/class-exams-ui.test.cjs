const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../services/siap-exam/node_modules/jsdom');

const source = name => readFileSync(path.join(__dirname,'..',name),'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve,20));

function setup({role='teacher',className='1A',seed=[]}={}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>',{runScripts:'dangerously'});
  const {window} = dom, rows=[...seed], students=[{id:'student-1',full_name:'Aluno Exemplo'}];
  let header=null,printed='';
  const query=(table,operation,payload)=>{
    const q={
      eq(){return q;},is(){return q;},order(){return q;},range(){return Promise.resolve({data:students,error:null});},select(){return q;},
      maybeSingle:async()=>({data:header,error:null}),
      single:async()=>{
        if(table==='class_exam_headers'){header={...payload};return {data:{school_id:'school-1'},error:null};}
        if(operation==='insert'){const row={...payload,id:`exam-${rows.length+1}`,questions:[],finalized_at:null};rows.push(row);return {data:{id:row.id},error:null};}
        if(operation==='update'){const row=rows.find(item=>item.id===currentId);Object.assign(row,payload);return {data:{id:row.id},error:null};}
        return {data:null,error:null};
      },
      then(resolve){resolve({data:table==='class_exams'?rows:students,error:null});}
    };
    return q;
  };
  let currentId=null;
  const from=table=>({
    select:()=>query(table,'read'),
    insert:payload=>query(table,'insert',payload),
    update:payload=>{const q=query(table,'update',payload),eq=q.eq;q.eq=(column,value)=>{if(column==='id')currentId=value;return eq.call(q,column,value);};return q;},
    upsert:payload=>query(table,'upsert',payload)
  });
  window.db={auth:{getUser:async()=>({data:{user:{id:'teacher-1'}},error:null})},from,rpc:async(name,args)=>{
    if(name==='get_cepi_access_context')return {data:{enabled:false},error:null};
    if(name==='set_class_exam_deleted'){
      const exam=rows.find(row=>row.id===args.p_exam_id);
      if(!exam||exam.school_id!==args.p_school_id||exam.class_id!==args.p_class_id||
        (role==='teacher'&&exam.created_by!=='teacher-1'))return {data:null,error:new Error('Sem permissão')};
      exam.deleted_at=args.p_restore?null:new Date().toISOString();
      return {data:true,error:null};
    }
    return {data:null,error:new Error('RPC desconhecida')};
  },storage:{from:()=>({createSignedUrl:async()=>({data:null,error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})}};
  window.getActiveSchoolRole=()=>role;window.getActiveSchoolId=()=> 'school-1';window.confirm=()=>true;
  window.open=()=>({document:{write:html=>{printed=html;},close(){},querySelectorAll:()=>[],images:[]},focus(){},print(){}});
  window.CepiRichText={marker:'<!--cepi-rich-v1-->',sanitize:value=>value,hydrate:async()=>{},render:value=>String(value).startsWith('<!--cepi-rich-v1-->')?`<div class="cepi-rich-content">${value.slice(19)}</div>`:`<div>${value}</div>`,mount:editor=>({serialize:async()=>({value:'<!--cepi-rich-v1-->'+editor.innerHTML,uploaded:[]}),rollback:async()=>{},dispose(){},insertImage:async()=>{},setImageWidth(){},setImageAlign(){},moveImage(){},removeImage(){}})};
  window.eval(source('cepi-blocks.js'));window.eval(source('class-exams.js'));
  window.document.body.innerHTML=window.getClassExamPanelAction();
  window.bindClassExamPanelAction({classId:'class-1',className});window.document.querySelector('#classExamAction').click();
  return {dom,window,rows,students,getHeader:()=>header,getPrinted:()=>printed};
}

test('professor cria prova mensal com editor rico, finaliza e imprime nominal',async()=>{
  const env=setup();const {window,rows}=env;
  try{
    await tick();
    assert.equal(window.document.querySelectorAll('[data-type]').length,1);
    assert.equal(window.document.querySelector('#cxeHeader'),null);
    window.document.querySelector('[data-type="regular"]').click();
    window.document.querySelector('#cxeNew').click();
    const form=window.document.querySelector('#cxeForm');
    assert.equal(form.elements.exam_type.value,'mensal');
    form.elements.subject.value='Ciências';form.elements.title.value='Prova mensal de Ciências';
    form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.equal(rows.length,1);assert.equal(rows[0].created_by,'teacher-1');assert.equal(rows[0].class_id,'class-1');
    window.document.querySelector('#cxeAdd').click();
    const editor=window.document.querySelector('#cxeEditor');
    editor.innerHTML='<p><b>Qual é a resposta?</b></p><p>A) Uma</p><p>B) Outra</p>';
    assert.ok(window.document.querySelector('[data-command="bold"]'));
    assert.ok(window.document.querySelector('[data-image="1"]'));
    window.document.querySelector('[name="correct_answer"]').value='B';
    window.document.querySelector('#cxeQuestionForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.match(rows[0].questions[0].statement,/<!--cepi-rich-v1-->/);
    assert.match(rows[0].questions[0].statement,/B\) Outra/);
    assert.equal(Object.keys(rows[0].questions[0].alternatives).length,0);
    assert.match(window.document.querySelector('#cxeQuestionForm h4').textContent,/questão 2/);
    window.document.querySelector('#cxeBack').click();
    window.document.querySelector('#cxeFinalize').click();await tick();
    assert.ok(rows[0].finalized_at);
    window.document.querySelector('#cxePrint').click();await tick();
    assert.match(env.getPrinted(),/Aluno Exemplo/);
    assert.match(env.getPrinted(),/Cartão-resposta/);
    assert.match(env.getPrinted(),/class="front"/);
    assert.match(env.getPrinted(),/Qual é a resposta/);
    window.document.querySelector('#cxeKey').click();await tick();
    assert.match(env.getPrinted(),/Gabarito oficial/);
  }finally{env.dom.window.close();}
});

test('coordenação edita cabeçalho geral e 3ª série mantém plano ENEM',async()=>{
  const env=setup({role:'coordinator',className:'3A'});const {window}=env;
  try{
    await tick();window.document.querySelector('[data-type="enem"]').click();
    assert.ok(window.document.querySelector('#cxeHeader'));
    window.document.querySelector('#cxeHeader').click();
    const headerForm=window.document.querySelector('#cxeHeaderForm');
    headerForm.elements.school_name.value='Escola Exemplo';
    headerForm.elements.subtitle.value='Leia cada questão com atenção.';
    headerForm.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.equal(env.getHeader().school_id,'school-1');
    assert.equal(env.getHeader().school_name,'Escola Exemplo');
    window.document.querySelector('#cxeNew').click();
    const examForm=window.document.querySelector('#cxeForm');
    assert.equal(examForm.elements.title.value,'SIMULADO ENEM - CADERNO 1 - 4º BIM');
    assert.match(window.document.querySelector('#cxePlan').textContent,/Química: 8/);
  }finally{env.dom.window.close();}
});

test('editor rico busca imagens da prova da turma no bucket próprio',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{runScripts:'dangerously'});
  try{
    const {window}=dom;window.eval(source('cepi-rich-text.js'));
    const schoolId='11111111-1111-4111-8111-111111111111';
    const path=`${schoolId}/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png`;
    const root=window.document.createElement('div');root.innerHTML=`<img data-cepi-path="${path}">`;
    let selectedBucket='';
    await window.CepiRichText.hydrate(root,{storage:{from:bucket=>{selectedBucket=bucket;return {createSignedUrl:async()=>({data:{signedUrl:'https://example.com/image.png'},error:null})};}}},schoolId,'class-exam-images');
    assert.equal(selectedBucket,'class-exam-images');
    assert.equal(root.querySelector('img').src,'https://example.com/image.png');
  }finally{dom.window.close();}
});

test('botão exclui prova finalizada na linha e permite restaurar',async()=>{
  const exam={id:'exam-1',school_id:'school-1',class_id:'class-1',created_by:'teacher-1',
    exam_type:'mensal',title:'RECUPERAÇÃO',subject:'Matemática',academic_year:2026,
    questions:[{statement:'Questão de exemplo',correct_answer:'A'}],finalized_at:'2026-10-27T10:00:00Z'};
  const env=setup({seed:[exam]});const {window}=env;
  try{
    await tick();window.document.querySelector('[data-type="regular"]').click();
    const item=window.document.querySelector('.cxe-item');
    assert.deepEqual([...item.querySelectorAll('button')].map(button=>button.textContent),
      ['Abrir','Imprimir prova','Imprimir gabarito','Excluir prova']);
    item.querySelector('.cxe-delete').click();await tick();
    assert.ok(exam.deleted_at);
    assert.equal(window.document.querySelector('[data-open]'),null);
    assert.match(window.document.querySelector('.cxe-deleted').textContent,/Restaurar prova/);
    window.document.querySelector('[data-restore]').click();await tick();
    assert.equal(exam.deleted_at,null);
    assert.ok(window.document.querySelector('[data-open]'));
  }finally{env.dom.window.close();}
});

test('coordenação pode excluir prova de outro professor, professor não',async()=>{
  const exam={id:'exam-2',school_id:'school-1',class_id:'class-1',created_by:'teacher-2',
    exam_type:'mensal',title:'PROVA',subject:'Geografia',academic_year:2026,
    questions:[],finalized_at:'2026-10-27T10:00:00Z'};
  for(const role of ['teacher','coordinator']){
    const env=setup({role,seed:[exam]});
    try{
      await tick();env.window.document.querySelector('[data-type="regular"]').click();
      assert.equal(Boolean(env.window.document.querySelector('.cxe-delete')),role==='coordinator');
    }finally{env.dom.window.close();}
  }
});
