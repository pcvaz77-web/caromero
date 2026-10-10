const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const card = require('../family-digital-card.js');

const token = '00000000-0000-4000-8000-000000000001';
const fixture = { school_name:'Escola Exemplo',student_name:'Aluno Fictício',class_name:'6A',guardian_name:'Responsável Exemplo',guardian_phone:'+5561999999999',qr_token:token };

function harness() {
  const operations = [];
  const context = {
    fillRect:(...args) => operations.push(['fillRect',...args]),
    fillText:(...args) => operations.push(['fillText',...args]),
    drawImage:(...args) => operations.push(['drawImage',...args]),
    measureText:value => ({width:String(value).length * 13}),
    save(){},restore(){},beginPath(){},rect(){},clip(){},translate(){},rotate(){},moveTo(){},lineTo(){},stroke(){},
  };
  const doc = { createElement:tag => { assert.equal(tag,'canvas'); return {width:0,height:0,getContext:() => context}; } };
  const qrValues = [];
  const qr = () => ({addData:value => qrValues.push(value),make(){},getModuleCount:() => 3,isDark:(row,col) => row === col});
  return {doc,qr,operations,qrValues};
}

test('imagem digital coloca frente e verso na horizontal com o mesmo QR da impressão', () => {
  const h = harness();
  const canvas = card.render(fixture, {width:300,height:400}, h.qr, h.doc);
  assert.deepEqual([canvas.width,canvas.height],[1600,500]);
  assert.deepEqual(h.qrValues,[`CAROMETRO:CARD:${token}`]);
  assert.equal(h.operations.filter(row => row[0] === 'drawImage').length,1);
  assert.equal(h.operations.filter(row => row[0] === 'fillText' && row[1] === 'Escola Exemplo').length,14);
  assert.equal(h.operations.some(row => row[0] === 'fillText' && row[1] === 'Aluno Fictício'),true);
});

test('QR ampliado mantém o identificador e recusa token fora do formato da carteirinha', () => {
  const h = harness();
  const enlarged = card.renderQr(token,h.qr,h.doc);
  assert.deepEqual([enlarged.width,enlarged.height],[760,760]);
  assert.deepEqual(h.qrValues,[`CAROMETRO:CARD:${token}`]);
  assert.throws(() => card.renderQr('outro-qr',h.qr,h.doc),/inválido/);
});

test('liberação escolar começa desativada e foto fica restrita ao vínculo ativo', () => {
  const sql = fs.readFileSync(path.join(__dirname,'..','supabase','migrations','172_family_digital_cards.sql'),'utf8');
  assert.match(sql,/enabled boolean not null default false/);
  assert.match(sql,/family_my_students\(\) allowed/);
  assert.match(sql,/settings\.enabled=true/);
  assert.match(sql,/storage\.objects for select to authenticated/);
  assert.match(sql,/family_can_read_digital_card_photo\(name\)/);
});
