(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CarometroPrintBranding = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const image = value => /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(String(value || '')) ? value : null;
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  async function load(db, schoolId) {
    if (!db || !schoolId) return null;
    const read = async table => {
      try {
        const { data, error } = await db.from(table).select('school_logo_data,state_logo_data').eq('school_id',schoolId).maybeSingle();
        return error ? null : data;
      } catch { return null; }
    };
    const [cepi, regular] = await Promise.all([read('cepi_exam_headers'), read('class_exam_headers')]);
    return {
      school_logo_data:image(cepi?.school_logo_data) || image(regular?.school_logo_data),
      state_logo_data:image(cepi?.state_logo_data) || image(regular?.state_logo_data)
    };
  }

  function markup(branding) {
    const logo = (data, alt) => image(data) ? `<img src="${escape(data)}" alt="${alt}">` : '';
    return `<div class="print-branding"><div>${logo(branding?.school_logo_data,'Logo da escola')}</div><div>${logo(branding?.state_logo_data,'Logo do estado')}</div></div>`;
  }

  function drawPdf(doc, branding, { pageWidth, left=15, right=15, top=8, width=25, height=22 }) {
    for (const [side, data] of [['left',branding?.school_logo_data],['right',branding?.state_logo_data]]) {
      if (!image(data)) continue;
      try {
        const props = doc.getImageProperties(data);
        const ratio = Math.min(width / props.width, height / props.height);
        const imageWidth = props.width * ratio;
        const imageHeight = props.height * ratio;
        const x = side === 'left' ? left : pageWidth - right - imageWidth;
        doc.addImage(data,props.fileType,x,top,imageWidth,imageHeight);
      } catch { /* Um logo inválido não deve impedir a impressão do relatório. */ }
    }
  }
  return Object.freeze({load,markup,drawPdf});
});
