(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FamilyCardPrint = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const initials = value => String(value || '').split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0]).join('').toUpperCase();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const qrValue = token => {
    if (!uuid.test(String(token || ''))) throw new Error('Identificador da carteirinha inválido.');
    return `CAROMETRO:CARD:${token}`;
  };
  // O SVG é conteúdo impresso: a faixa continua azul mesmo quando o navegador
  // desativa a opção de imprimir imagens de fundo.
  const schoolHeader = name => `<div class="school"><svg aria-hidden="true" viewBox="0 0 100 20" preserveAspectRatio="none"><rect width="100" height="20" fill="#1d3b76"/></svg><span>${escape(name || 'Escola')}</span></div>`;
  function render(cards, schoolName, qrSvg) {
    if (!Array.isArray(cards) || !cards.length || typeof qrSvg !== 'function') throw new Error('Nenhuma carteirinha disponível.');
    const pages = [];
    for (let start = 0; start < cards.length; start += 8) {
      const group = cards.slice(start, start + 8);
      const front = group.map(card => `<article class="card-face">${schoolHeader(schoolName)}<div class="front-body"><div class="photo">${card.photo_url ? `<img src="${escape(card.photo_url)}" alt="">` : `<span>${escape(initials(card.student_name))}</span>`}</div><div class="details"><strong>${escape(card.student_name)}</strong><p>Turma: ${escape(card.class_name)}</p><p>Responsável: ${escape(card.guardian_name || 'Não informado')}</p><p>Contato: ${escape(card.guardian_phone || 'Não informado')}</p></div></div><footer>Carteirinha escolar · Carômetro</footer></article>`).join('');
      // Na impressão frente e verso pela borda longa, a posição do verso é espelhada.
      const back = [];
      for (let row = 0; row < 4; row++) {
        for (const index of [row * 2 + 1, row * 2]) {
          const card = group[index];
          back.push(card ? `<article class="card-face card-back">${schoolHeader(schoolName)}<div class="code">${qrSvg(qrValue(card.qr_token))}</div><strong>${escape(card.student_name)}</strong><small>Apresente esta carteirinha na entrada da escola.</small></article>` : '<article class="card-face blank"></article>');
        }
      }
      pages.push(`<section class="sheet">${front}</section><section class="sheet">${back.join('')}</section>`);
    }
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Carteirinhas escolares · ${escape(schoolName)}</title><style>
      @page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}body{margin:0;background:#eef1f7;color:#17233a;font:9pt Arial,sans-serif}.toolbar{position:sticky;top:0;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 18px;box-shadow:0 3px 12px #0002}.toolbar button{border:0;border-radius:9px;background:#4566d9;color:#fff;padding:10px 16px;font-weight:bold;cursor:pointer}.toolbar p{margin:3px 0 0;font-size:8pt}.sheet{width:200mm;height:287mm;display:grid;grid-template-columns:repeat(2,99mm);grid-template-rows:repeat(4,70mm);gap:2mm;margin:14px auto;background:#fff;break-after:page}.sheet:last-child{break-after:auto}.card-face{min-width:0;min-height:0;border:1px dashed #9ca6b8;border-radius:2mm;padding:3mm;overflow:hidden;display:flex;flex-direction:column;background:#fff}.school{position:relative;isolation:isolate;overflow:hidden;background:#1d3b76;color:#fff;font-weight:bold;font-size:9pt;text-align:center;padding:2.5mm 1mm;border-radius:1.2mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}.school svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.school span{position:relative;color:#fff}.front-body{display:flex;gap:3mm;align-items:flex-start;margin-top:3mm;min-height:0;flex:1}.photo{width:20mm;height:26mm;flex:none;border-radius:1.5mm;background:#e4eaff;color:#29468a;display:grid;place-items:center;font-size:15pt;font-weight:bold;overflow:hidden}.photo img{width:100%;height:100%;object-fit:cover}.details{min-width:0;overflow-wrap:anywhere}.details strong{display:block;font-size:9pt;line-height:1.2}.details p{margin:2mm 0 0;font-size:7.2pt;line-height:1.2}.card-face footer{border-top:1px solid #e1e5ee;text-align:center;padding-top:1.5mm;font-size:6.5pt;color:#5d6b86}.card-back{align-items:center;text-align:center}.card-back .school{width:100%}.code{display:grid;place-items:center;flex:1;min-height:0}.code svg{width:31mm;height:31mm}.card-back strong{font-size:8pt}.card-back small{font-size:6pt;margin-top:1mm}.blank{border:0}@media print{body{background:#fff}.toolbar{display:none}.sheet{margin:0;page-break-after:always}.sheet:last-child{page-break-after:auto}}
    </style><div class="toolbar"><div><b>${cards.length} carteirinha(s) · 8 por folha A4</b><p>Imprima frente e verso, vire na borda longa, em escala 100% e sem cabeçalhos do navegador.</p></div><button id="printNow" type="button">Imprimir / salvar PDF</button></div>${pages.join('')}<script>document.getElementById('printNow').onclick=()=>window.print()<\/script></html>`;
  }
  return Object.freeze({ qrValue, render });
});
