(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CepiAnswerSheets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function prepare(test, allQuestions) {
    if (!test || !Number.isInteger(test.question_count) || test.question_count < 1 || test.question_count > 100) throw new Error('Total de questões inválido.');
    const rows = allQuestions.filter(q => q.test_id === test.id).sort((a,b) => a.number - b.number);
    const alphabet = test.answer_format === 'VF' ? ['V','F'] : [...String(test.answer_format || '')];
    if (!['ABCD','ABCDE','VF'].includes(test.answer_format) || rows.length !== test.question_count || rows.some((q,i) => q.number !== i + 1 || !alphabet.includes(q.correct_answer))) throw new Error('Complete e confira todas as questões e respostas antes de imprimir o cartão.');
    if (test.kind === 'bloco' && (!Array.isArray(test.subject_plan) || !test.subject_plan.length)) throw new Error('A divisão de matérias deste bloco não está configurada.');
    if (Array.isArray(test.subject_plan) && test.subject_plan.length && (test.subject_plan.reduce((total,item)=>total+Number(item.count||0),0)!==rows.length || test.subject_plan.some(item=>rows.filter(row=>row.subject===item.subject).length!==Number(item.count)))) throw new Error('A divisão das questões não corresponde aos componentes configurados para este bloco.');
    return { test, rows, alphabet, answers:rows.map(q => q.correct_answer) };
  }
  function base(title, body) {
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>
      @page{size:A5 portrait;margin:9mm}*{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#111;margin:0;background:#eef1f7}.toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px;background:#fff}.toolbar button{border:0;border-radius:8px;background:#5149dc;color:#fff;padding:10px 16px;font-weight:bold;cursor:pointer}.sheet{position:relative;width:148mm;min-height:210mm;margin:12px auto;padding:13mm 12mm 11mm;background:white;box-shadow:0 6px 24px #0002}.marker{position:absolute;width:4mm;height:4mm;background:#111}.tl{top:5mm;left:5mm}.tr{top:5mm;right:5mm}.bl{bottom:5mm;left:5mm}.br{bottom:5mm;right:5mm}header{text-align:center;border-bottom:1px solid #333;padding-bottom:4mm;margin-bottom:5mm}header b{display:block;font-size:12pt}header small{display:block;margin-top:2mm}.fields{display:grid;gap:4mm;margin-bottom:5mm}.line{border-bottom:1px solid #555;min-height:6mm}.signature{border:1px solid #333;height:18mm;padding:2mm;margin-top:3mm}.signature span{font-size:8pt}.columns{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}.column{display:grid;align-content:start;gap:2mm}.answer-row{display:flex;align-items:center;gap:1.4mm;white-space:nowrap;break-inside:avoid}.number{width:7mm;text-align:right;font-weight:bold}.bubble{display:inline-flex;align-items:center;justify-content:center;border:1px solid #555;border-radius:50%;width:5mm;height:5mm;font-size:7pt}.bubble.filled{background:#111;color:#fff;border-color:#111}footer{font-size:8pt;text-align:center;margin-top:5mm}.notice{font-size:8pt;margin:4mm 0}.key-label{font-weight:bold;text-align:center;margin-bottom:4mm;color:#7f1730}@media print{body{background:white}.toolbar{display:none}.sheet{margin:0;box-shadow:none;width:auto;min-height:0;page-break-after:always}}
    </style><div class="toolbar"><strong>${escape(title)}</strong><button type="button" id="printNow">Imprimir / salvar PDF</button></div>${body}<script>document.getElementById('printNow').onclick=()=>window.print()<\/script></html>`;
  }
  function identity(prepared, schoolName) {
    const {test} = prepared;
    return `<header><b>${escape(schoolName || 'Escola')}</b><small>${escape(test.title)} · ${test.question_count} questões</small></header>`;
  }
  function grid(prepared, official = false) {
    const {rows,alphabet} = prepared;
    const perColumn = Math.ceil(rows.length / 3);
    return `<div class="columns">${[0,1,2].map(column => `<div class="column">${rows.slice(column*perColumn,(column+1)*perColumn).map(q => `<div class="answer-row"><span class="number">${q.number}</span>${alphabet.map(letter => `<span class="bubble${official && q.correct_answer === letter ? ' filled' : ''}">${letter}</span>`).join('')}</div>`).join('')}</div>`).join('')}</div>`;
  }
  function studentHtml(prepared, schoolName, quantity = 4) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 600) throw new Error('Informe entre 1 e 600 cartões.');
    const subjects = (prepared.test.subject_plan?.length
      ? prepared.test.subject_plan.map(item=>`${item.subject}: ${item.count}`)
      : [...new Set(prepared.rows.map(q=>q.subject))].map(subject=>`${subject}: ${prepared.rows.filter(q=>q.subject===subject).length}`)).join(' · ');
    const card = `<section class="student-card"><i class="marker tl"></i><i class="marker tr"></i><i class="marker bl"></i><i class="marker br"></i><header><b>${escape(schoolName || 'Escola')}</b><small>${escape(prepared.test.title)} · ${prepared.test.question_count} questões</small><small>${escape(subjects)}</small></header><div class="student-fields"><div>Nome: <span class="line"></span></div><div>Turma: ______ Nº: ______ Data: ____/____/______</div><div class="student-signature">Assinatura: ______________________________</div></div>${grid(prepared)}<footer>Preencha completamente uma bolha por questão.</footer></section>`;
    const pages = Array.from({length:Math.ceil(quantity / 4)},(_,page) => `<div class="card-page">${Array.from({length:Math.min(4,quantity-page*4)},()=>card).join('')}</div>`).join('');
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cartões-resposta · ${escape(prepared.test.title)}</title><style>
      @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#eef1f7;color:#111;font:8pt Arial,sans-serif}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px;background:#fff}.toolbar button{border:0;border-radius:8px;background:#5149dc;color:#fff;padding:10px 16px;font-weight:bold;cursor:pointer}.card-page{width:210mm;height:297mm;margin:10px auto;padding:6mm;display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,1fr);gap:2mm;background:#fff;box-shadow:0 6px 24px #0002;break-after:page}.student-card{position:relative;min-width:0;overflow:hidden;padding:6mm 4mm 3mm;border:1px dashed #777}.marker{position:absolute;width:2.5mm;height:2.5mm;background:#111}.tl{top:1mm;left:1mm}.tr{top:1mm;right:1mm}.bl{bottom:1mm;left:1mm}.br{bottom:1mm;right:1mm}header{text-align:center;border-bottom:1px solid #555;margin-bottom:3mm;padding-bottom:2mm}header b{display:block;font-size:9pt}header small{display:block;font-size:6.5pt}.student-fields{display:grid;gap:2mm;margin-bottom:4mm;font-size:7pt}.student-fields .line{display:inline-block;vertical-align:bottom;border-bottom:1px solid #333;width:72mm;height:5mm}.student-signature{margin-top:1mm}.columns{display:grid;grid-template-columns:repeat(3,1fr);gap:1mm}.column{display:grid;align-content:start;gap:1.4mm}.answer-row{display:flex;align-items:center;gap:.45mm;white-space:nowrap;break-inside:avoid}.number{width:4.5mm;text-align:right;font-weight:bold}.bubble{display:inline-flex;align-items:center;justify-content:center;width:3.7mm;height:3.7mm;border:1px solid #555;border-radius:50%;font-size:5pt}footer{text-align:center;font-size:6pt;margin-top:3mm}@media print{body{background:white}.toolbar{display:none}.card-page{margin:0;box-shadow:none;page-break-after:always}.card-page:last-of-type{page-break-after:auto}}
    </style><div class="toolbar"><strong>${quantity} cartão(ões) · 4 por folha A4</strong><button id="printNow" type="button">Imprimir / salvar PDF</button></div>${pages}<script>document.getElementById('printNow').onclick=()=>window.print()<\/script></html>`;
  }
  function officialHtml(prepared, schoolName) {
    return base('Gabarito oficial · uso interno', `<section class="sheet"><i class="marker tl"></i><i class="marker tr"></i><i class="marker bl"></i><i class="marker br"></i>${identity(prepared,schoolName)}<div class="key-label">GABARITO OFICIAL · USO DA COORDENAÇÃO</div>${grid(prepared,true)}<footer>As bolhas preenchidas são as respostas salvas nas questões.</footer></section>`);
  }
  return Object.freeze({prepare,studentHtml,officialHtml});
});
