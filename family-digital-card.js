(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FamilyDigitalCard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ink = '#17233a';
  const navy = '#1d3b76';
  const text = value => String(value ?? '').trim();

  function lines(ctx, value, maxWidth, maxLines) {
    const words = text(value).split(/\s+/).filter(Boolean);
    const result = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else { result.push(line); line = word; }
    }
    if (line) result.push(line);
    if (result.length > maxLines) {
      result.length = maxLines;
      while (ctx.measureText(`${result[maxLines - 1]}…`).width > maxWidth && result[maxLines - 1].length > 1)
        result[maxLines - 1] = result[maxLines - 1].slice(0, -1);
      result[maxLines - 1] += '…';
    }
    return result;
  }
  function schoolHeader(ctx, school, x, width) {
    ctx.fillStyle = navy;
    ctx.fillRect(x, 0, width, 78);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '700 27px Arial, sans-serif';
    lines(ctx, school || 'Escola', width - 44, 1).forEach(line => ctx.fillText(line, x + width / 2, 48));
    ctx.textAlign = 'left';
  }
  function watermark(ctx, school, x, width) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, 78, width, 422); ctx.clip();
    ctx.translate(x + width / 2, 275);
    ctx.rotate(-Math.PI / 8);
    ctx.fillStyle = 'rgba(29,59,118,.055)';
    ctx.font = '700 34px Arial, sans-serif';
    ctx.textAlign = 'center';
    for (const y of [-180, -108, -36, 36, 108, 180])
      ctx.fillText(text(school).slice(0, 45), 0, y, width * 1.2);
    ctx.restore();
  }
  function photo(ctx, image, name) {
    const x = 38, y = 112, width = 215, height = 280;
    ctx.fillStyle = '#e7edff'; ctx.fillRect(x, y, width, height);
    if (image) {
      const scale = Math.max(width / image.width, height / image.height);
      const sw = width / scale, sh = height / scale;
      ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, width, height);
    } else {
      ctx.fillStyle = navy; ctx.textAlign = 'center'; ctx.font = '700 52px Arial, sans-serif';
      ctx.fillText(text(name).split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase(), x + width / 2, y + 155);
      ctx.font = '18px Arial, sans-serif'; ctx.fillText('Foto não cadastrada', x + width / 2, y + 192);
      ctx.textAlign = 'left';
    }
  }
  function drawQr(ctx, factory, token, x, y, size) {
    if (!uuid.test(text(token))) throw new Error('QR Code da carteirinha inválido.');
    const qr = factory(0, 'M');
    qr.addData(`CAROMETRO:CARD:${token}`); qr.make();
    const count = qr.getModuleCount();
    const quiet = 4;
    const moduleSize = size / (count + quiet * 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#111';
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) ctx.fillRect(x + (col + quiet) * moduleSize, y + (row + quiet) * moduleSize, moduleSize + .15, moduleSize + .15);
    }
  }
  function render(card, image, factory, doc = document) {
    if (!card || typeof factory !== 'function') throw new Error('Carteirinha indisponível.');
    const canvas = doc.createElement('canvas');
    canvas.width = 1600; canvas.height = 500;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1600, 500);
    watermark(ctx, card.school_name, 0, 800);
    watermark(ctx, card.school_name, 800, 800);
    schoolHeader(ctx, card.school_name, 0, 800);
    schoolHeader(ctx, card.school_name, 800, 800);
    ctx.strokeStyle = '#b8c7dd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(800, 0); ctx.lineTo(800, 500); ctx.stroke();
    photo(ctx, image, card.student_name);
    ctx.fillStyle = ink;
    ctx.font = '700 29px Arial, sans-serif';
    const nameLines = lines(ctx, card.student_name, 490, 3);
    nameLines.forEach((line, i) => ctx.fillText(line, 282, 143 + i * 36));
    const detailsTop = Math.max(236, 143 + nameLines.length * 36 + 15);
    ctx.font = '24px Arial, sans-serif';
    ctx.fillText(`Turma: ${text(card.class_name)}`, 282, detailsTop, 490);
    ctx.font = '21px Arial, sans-serif';
    lines(ctx, `Responsável: ${text(card.guardian_name) || 'Não informado'}`, 490, 2)
      .forEach((line, i) => ctx.fillText(line, 282, detailsTop + 47 + i * 29));
    ctx.fillText(`Contato: ${text(card.guardian_phone) || 'Não informado'}`, 282, detailsTop + 121, 490);
    ctx.fillStyle = '#5d6b86'; ctx.font = '17px Arial, sans-serif';
    ctx.fillText('Carteirinha escolar · Carômetro', 38, 467);
    drawQr(ctx, factory, card.qr_token, 1002, 97, 360);
    ctx.fillStyle = ink; ctx.textAlign = 'center';
    ctx.font = '700 25px Arial, sans-serif';
    lines(ctx, card.student_name, 720, 1).forEach(line => ctx.fillText(line, 1200, 477));
    ctx.textAlign = 'left';
    return canvas;
  }
  function renderQr(token, factory, doc = document) {
    const canvas = doc.createElement('canvas');
    canvas.width = 760; canvas.height = 760;
    drawQr(canvas.getContext('2d'), factory, token, 0, 0, 760);
    return canvas;
  }
  return { render, renderQr };
});
