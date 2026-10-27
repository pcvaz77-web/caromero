const {test}=require('node:test');
const assert=require('node:assert/strict');
const printer=require('../enem-print.js');

const model=(count=45)=>({model:count===90?'simuladao':'caderno_1',year:2026,bimester:4,count,plan:[{subject:'Língua Portuguesa',count}],scheduledOn:'2026-10-26',phrase:'Aprender abre caminhos.'});
const header={school_name:'Colégio Exemplo',state_name:'Goiás',department_name:'Secretaria de Educação'};

test('cada aluno recebe capa, cartão individual e questões em sequência',()=>{
  const html=printer.documentHtml(model(),header,[{name:'Ana Souza',className:'3A'},{name:'Bruno Lima',className:'3B'}],'<p>QUESTÃO DE EXEMPLO</p>');
  assert.equal((html.match(/class="page cover"/g)||[]).length,2);
  assert.equal((html.match(/class="page answer-page"/g)||[]).length,2);
  assert.equal((html.match(/class="page question-page"/g)||[]).length,2);
  assert.match(html,/Ana Souza[\s\S]*CARTÃO-RESPOSTA[\s\S]*QUESTÃO DE EXEMPLO[\s\S]*Bruno Lima/);
  assert.match(html,/decorative-barcode/);
  assert.match(html,/Aprender abre caminhos/);
  assert.doesNotMatch(html,/Assinatura do participante/);
});

test('cartão avulso tem assinatura e o simuladão mostra 90 marcações',()=>{
  const html=printer.cardsHtml(model(90),header,[{unnamed:true,className:'3A'}]);
  assert.equal((html.match(/class="answer-row"/g)||[]).length,90);
  assert.equal((html.match(/class="bubble"/g)||[]).length,450);
  assert.match(html,/Assinatura do participante/);
  assert.doesNotMatch(html,/class="page cover"/);
});

test('dados impressos são escapados e a distribuição deve corresponder ao total',()=>{
  assert.doesNotMatch(printer.cover(model(),header,{name:'<script>alert(1)</script>',className:'3A'}),/<script>/);
  assert.throws(()=>printer.documentHtml({...model(),count:90},header,[{name:'Ana'}]),/distribuição/);
});

test('capa usa a distribuição do caderno e substitui frase antiga de outra prova',()=>{
  const plans={
    caderno_1:[['Química',8],['Física',7],['Biologia',8],['História',6],['Geografia',6],['Filosofia',5],['Sociologia',5]],
    caderno_2:[['Inglês',10],['Língua Portuguesa',5],['Arte',4],['Educação Física',4],['Matemática',22]]
  };
  for(const [name,entries] of Object.entries(plans)){
    const exam={...model(),model:name,plan:entries.map(([subject,count])=>({subject,count})),phrase:'Esta avaliação é composta por 15 questões, assim distribuídas: 15 questões de Língua Portuguesa.'};
    const html=printer.cover(exam,header,{name:'Ana Souza',className:'3A'});
    assert.match(html,/Esta avaliação é composta por 45 questões:/);
    assert.match(html,/Este caderno contém 45 questões numeradas de 01 a 45/);
    for(const [subject,count] of entries)assert.ok(html.includes(`${count} questões de ${subject}`),`${name}: ${subject}`);
    assert.doesNotMatch(html,/15 questões de Língua Portuguesa/);
    assert.match(html,/Faça sua prova com atenção e confiança\./);
  }
});
