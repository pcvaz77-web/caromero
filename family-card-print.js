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
  const watermark = name => {
    const label = String(name || 'Escola');
    let seed = [...label].reduce((value, character) => (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0, 0);
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const radians = 24 * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const width = 100;
    const height = 70;
    const maxNormal = width * sine + height * cosine;
    const points = Array.from({ length: 14 }, (_, index) => {
      const normal = (index + .5) * maxNormal / 14;
      const minAlong = Math.max(-normal * sine / cosine, (normal * cosine - height) / sine);
      const maxAlong = Math.min((width - normal * sine) / cosine, normal * cosine / sine);
      const along = minAlong + (maxAlong - minAlong) * random();
      const x = along * cosine + normal * sine;
      const y = -along * sine + normal * cosine;
      return [x / width * 100, y / height * 100];
    });
    return `<div class="watermark" aria-hidden="true">${points.map(([x,y]) => `<span style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%">${escape(label)}</span>`).join('')}</div>`;
  };
  function render(cards, schoolName, qrSvg, barcodeSvg) {
    if (!Array.isArray(cards) || !cards.length || typeof qrSvg !== 'function' || typeof barcodeSvg !== 'function') throw new Error('Nenhuma carteirinha disponível.');
    const pages = [];
    for (let start = 0; start < cards.length; start += 5) {
      const group = cards.slice(start, start + 5);
      const pairs = group.map(card => {
        const qr = qrSvg(qrValue(card.qr_token));
        const registration = String(card.registration_number || '').trim();
        const barcode = registration ? barcodeSvg(registration) : '';
        return `<div class="card-pair"><article class="card-face card-front">${watermark(schoolName)}${schoolHeader(schoolName)}<span class="class-name">Turma ${escape(card.class_name || '—')}</span><div class="photo">${card.photo_url ? `<img src="${escape(card.photo_url)}" alt="">` : `<span>${escape(initials(card.student_name))}</span>`}</div><div class="student-details"><strong class="student-name">${escape(card.student_name)}</strong><span>Responsável: ${escape(card.guardian_name || 'Não informado')}</span><span>Nº responsável: ${escape(card.guardian_phone || 'Não informado')}</span></div><div class="barcode">${barcode || '<span>Sem código de barras</span>'}</div><div class="registration">Matrícula: ${escape(registration || 'Não informada')}</div></article><article class="card-face card-back">${watermark(schoolName)}${schoolHeader(schoolName)}<div class="code back-code">${qr}</div><strong class="back-name">${escape(card.student_name)}</strong><small>Apresente esta carteirinha na entrada da escola.</small></article></div>`;
      }).join('');
      pages.push(`<section class="sheet">${pairs}</section>`);
    }
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Carteirinhas escolares · ${escape(schoolName)}</title><style>
      @page{size:A4 landscape;margin:5mm}*{box-sizing:border-box}body{margin:0;background:#eef1f7;color:#17233a;font:9pt Arial,sans-serif}.toolbar{position:sticky;top:0;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 18px;box-shadow:0 3px 12px #0002}.toolbar button{border:0;border-radius:9px;background:#4566d9;color:#fff;padding:10px 16px;font-weight:bold;cursor:pointer}.toolbar p{margin:3px 0 0;font-size:8pt}.sheet{width:287mm;height:200mm;display:grid;grid-template-columns:repeat(5,55mm);grid-template-rows:170mm;justify-content:space-between;align-content:center;margin:14px auto;background:#fff;break-after:page}.sheet:last-child{break-after:auto}.card-pair{width:55mm;height:170mm;display:grid;grid-template-rows:1fr 1fr;border:1px dashed #8796b4;break-inside:avoid}.card-face{position:relative;isolation:isolate;min-width:0;min-height:0;padding:2mm;overflow:hidden;display:flex;flex-direction:column;align-items:center;background:#fff}.card-front{border-bottom:1px dashed #8796b4}.card-back{transform:rotate(180deg);text-align:center}.watermark{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:-1}.watermark span{position:absolute;left:var(--x);top:var(--y);display:block;width:130%;transform:translate(-50%,-50%) rotate(-24deg);text-align:center;white-space:nowrap;overflow:hidden;color:rgba(29,59,118,.055);font-size:10pt;font-weight:bold}.school{position:relative;isolation:isolate;overflow:hidden;display:grid;place-items:center;width:100%;min-height:8mm;background:#1d3b76;color:#fff;font-weight:bold;font-size:6.8pt;line-height:1.05;text-align:center;padding:1mm;border-radius:1mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}.school svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.school span{position:relative;color:#fff}.class-name{font-size:6pt;color:#45618a;margin-top:.6mm}.photo{width:20mm;height:22mm;flex:none;border-radius:1mm;background:#e4eaff;color:#29468a;display:grid;place-items:center;font-size:12pt;font-weight:bold;overflow:hidden;margin:1mm 0}.photo img{width:100%;height:100%;object-fit:cover}.student-details{width:100%;min-height:0;display:flex;flex-direction:column;align-items:center;gap:.4mm;text-align:center;overflow-wrap:anywhere}.student-name{font-size:8pt;line-height:1.08;margin-bottom:2mm}.student-details span{font-size:6.6pt;line-height:1.08}.code{display:grid;place-items:center;flex:none}.code svg{display:block;width:100%;height:100%}.barcode{width:45mm;height:11mm;display:grid;place-items:center;flex:none;margin-top:auto}.barcode svg{display:block;width:100%;height:100%}.barcode span{font-size:6pt;color:#5d6b86}.registration{font-size:6.5pt;line-height:1.1;text-align:center;overflow-wrap:anywhere;margin-top:2.5mm;margin-bottom:.8mm}.back-code{width:32mm;height:32mm;margin:auto 0}.back-name{font-size:7.5pt;line-height:1.15;overflow-wrap:anywhere}.card-back small{font-size:5.8pt;line-height:1.1;margin-top:1.5mm}@media print{body{background:#fff}.toolbar{display:none}.sheet{margin:0;page-break-after:always}.sheet:last-child{page-break-after:auto}}
    </style><div class="toolbar"><div><b>${cards.length} carteirinha(s) · até 5 por folha A4</b><p>Imprima em uma face, A4 paisagem, escala 100%, sem cabeçalhos. Recorte pelo tracejado externo e dobre na linha central; o verso fica legível após a dobra.</p></div><button id="printNow" type="button">Imprimir / salvar PDF</button></div>${pages.join('')}<script>document.getElementById('printNow').onclick=()=>window.print()<\/script></html>`;
  }
  return Object.freeze({ qrValue, render });
});
