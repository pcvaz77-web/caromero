const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname,'../reports.js'),'utf8');
const footerSource = source.slice(source.indexOf('  function applyFooters('),source.indexOf('  const slug ='));
const footer = vm.runInNewContext(`${footerSource}\nglobalThis.applyFooters`,{A4_HEIGHT:297,A4_WIDTH:210,MARGIN_X:15,Intl});

function pagesFor(signatures) {
  const pages = [[],[],[]];
  let current = 0;
  const doc = {
    getNumberOfPages:() => pages.length,
    setPage:page => { current = page - 1; },
    setDrawColor(){},setTextColor(){},setFont(){},setFontSize(){},
    line(x1,y1,x2,y2){pages[current].push({line:[x1,y1,x2,y2]});},
    text(value){pages[current].push({text:String(value)});},
    splitTextToSize:value => [value]
  };
  footer(doc,'Usuário Exemplo',new Date('2026-11-02T12:00:00Z'),signatures);
  return pages;
}

test('uma, duas ou três assinaturas selecionadas aparecem em todas as folhas', () => {
  for (const [selection, expected] of [
    [{coordinator:false,manager:true,guardian:false},['Gestor(a)']],
    [{coordinator:true,manager:false,guardian:true},['Coordenador(a)','Responsável']],
    [{coordinator:true,manager:true,guardian:true},['Coordenador(a)','Gestor(a)','Responsável']]
  ]) {
    for (const page of pagesFor(selection)) {
      const labels = page.filter(item => item.text && expected.includes(item.text)).map(item => item.text);
      assert.deepEqual(labels,expected);
      assert.equal(page.filter(item => item.line?.[1] === 255).length,expected.length);
    }
  }
  assert.ok(pagesFor({}).every(page => !page.some(item => /Coordenador|Gestor|Responsável/.test(item.text || ''))));
});

test('a área de conteúdo termina antes das assinaturas', () => {
  const segment = source.slice(source.indexOf('  function ensureSpace('),source.indexOf('  // doc.text(arrayDeLinhas'));
  const ensureSpace = vm.runInNewContext(`${segment}\nglobalThis.ensureSpace`,{
    A4_HEIGHT:297,BOTTOM_MARGIN:24,drawReportHeader:() => 40
  });
  let added = 0;
  const doc = {carometroSignatureReserve:55,addPage:() => added++,setFont(){},setFontSize(){},setTextColor(){},text(){}};
  assert.equal(ensureSpace(doc,235,10),40);
  assert.equal(added,1);
  doc.carometroSignatureReserve = 24;
  assert.equal(ensureSpace(doc,235,10),235);
});
