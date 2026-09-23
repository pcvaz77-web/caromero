import { fixture } from './fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const Core = require('../../../extensions/assistente-siap/src/exam-core.js');
const Dom = require('../../../extensions/assistente-siap/src/exam-dom.js');
const key = { alphabet: 'ABCDE', answers: Array(40).fill('A'), ranges: [{subject:'Arte',from:1,to:6},{subject:'Educação Física',from:7,to:14},{subject:'Língua Inglesa',from:15,to:20},{subject:'Língua Portuguesa',from:21,to:40}] };
test('cartão de 40 questões separa os quatro resultados sem IA', () => {
  const marked = Array(40).fill('A'); marked[0] = '-'; marked[7] = '*'; marked[15] = 'B'; marked[21] = 'E';
  assert.deepEqual(Core.score(key, marked).map(r => [r.total,r.correct]), [[6,5],[8,7],[6,5],[20,19]]);
});
test('branco e múltipla são zero; leitura incerta bloqueia o lote', () => {
  assert.throws(() => Core.score(key, Array(40).fill('?')), /Revise/);
  assert.throws(() => Core.answers('A B', 15, 'ABCD'), /quantidade/);
  assert.throws(() => Core.answers(Array(15).fill('E'), 15, 'ABCD'), /alternativas/);
});
test('gabarito com sobreposição, lacuna ou alternativa vazia é recusado', () => {
  assert.throws(() => Core.validateKey({...key, ranges:[{subject:'A',from:1,to:39}]}));
  assert.throws(() => Core.validateKey({...key, ranges:[{subject:'A',from:1,to:40},{subject:'B',from:2,to:4}]}));
  assert.throws(() => Core.validateKey({...key, answers:Array(40).fill('-')}));
});
test('nome precisa de correspondência única: abreviação e homônimos ficam pendentes', () => {
  const roster = [{id:'1',name:'João Pedro da Silva'},{id:'2',name:'João Paulo da Silva'}];
  assert.equal(Core.matchName('JOAO PEDRO DA SILVA',roster).id,'1');
  assert.equal(Core.matchName('João Silva',roster).id,'');
  assert.equal(Core.matchName('João Pedro da Silva',[...roster,{id:'3',name:roster[0].name}]).id,'');
});
test('lote bloqueia aluno repetido, transferido e quantidade/disciplina incompatível', () => {
  const roster=[{id:'1',name:'Teste'},{id:'2',name:'Transferido',unavailable:true}], item={studentId:'1',answers:key.answers,reviewed:true};
  assert.equal(Core.batch(key,[item],roster,'LÍNGUA PORTUGUESA',20)[0].correct,20);
  assert.throws(()=>Core.batch(key,[item,item],roster,'LÍNGUA PORTUGUESA',20),/mais de uma/);
  assert.throws(()=>Core.batch(key,[{...item,studentId:'2'}],roster,'LÍNGUA PORTUGUESA',20),/indisponível/);
  assert.throws(()=>Core.batch(key,[item],roster,'LÍNGUA PORTUGUESA',15),/diferente/);
});
test('extração com números omitidos ou repetidos nunca é renumerada', () => {
  const raw={name:'Teste',title:'Modelo',warning:'',alphabet:'ABCD',questions:[{number:1,mark:'A'},{number:3,mark:'B'}],ranges:[{subject:'Ciências',from:1,to:2}]};
  assert.throws(()=>Core.extraction(raw),/numeração/);
});
test('adaptador vincula escola, turma, avaliação, disciplina e lista; não confunde escolas', () => {
  const a=Dom.snapshot(new JSDOM(fixture()).window.document,Dom.route);
  const b=Dom.snapshot(new JSDOM(fixture({school:'Outra escola'})).window.document,Dom.route);
  const c=Dom.snapshot(new JSDOM(fixture({subject:'Arte'})).window.document,Dom.route);
  assert.notEqual(a.base,b.base); assert.equal(a.base,c.base); assert.notEqual(a.signature,c.signature);
  assert.throws(()=>Dom.snapshot(new JSDOM(fixture()).window.document,'/FrequenciaAlunoEdicao.aspx'));
});
test('pré-validação permite substituir acertos existentes, mas protege transferidos e chamada diária', () => {
  const get=options=>Dom.snapshot(new JSDOM(fixture(options)).window.document,Dom.route);
  const entries=[{id:'1 - JOÃO PEDRO TESTE',present:true,correct:12}];
  assert.doesNotThrow(()=>Dom.preflight(get({}),entries,1));
  assert.doesNotThrow(()=>Dom.preflight(get({filled:'0'}),entries,1));
  assert.throws(()=>Dom.preflight(get({unavailable:true}),entries,1),/indisponível/);
  assert.throws(()=>Dom.preflight(get({}),entries,3),/chamada/);
});
test('núcleo distribuído é idêntico ao utilizado no serviço', () => {
  assert.equal(readFileSync(new URL('../exam-core.cjs',import.meta.url),'utf8'), readFileSync(new URL('../../../extensions/assistente-siap/src/exam-core.js',import.meta.url),'utf8'));
});
