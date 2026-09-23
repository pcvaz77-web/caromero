(function (root, factory) {
  const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.SiapExamDom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const route = '/LancamentoNotasModeloEdicao.aspx';
  const selectionRoute = '/LancamentoNotasModeloListagem.aspx';
  const prefix = 'cphFuncionalidade_cphCampos_';
  function snapshot(doc, pathname) {
    const selecting = pathname === selectionRoute;
    if (pathname !== route && !selecting) throw new Error('Abra a página de lançamento da avaliação.');
    const table = doc.getElementById(prefix + 'gdvLista'), heading = doc.getElementById('h3TituloFuncionalidade');
    if ((!selecting && !table) || !heading) throw new Error('A página do SIAP não apresentou a avaliação esperada.');
    const value = suffix => String((doc.getElementById(prefix + suffix) || doc.getElementById(suffix))?.value || '').trim();
    const selected = suffix => {
      const el = doc.getElementById(prefix + suffix), option = el?.selectedOptions?.[0];
      return option && !/selecione/i.test(option.textContent) ? option.textContent.trim() : '';
    };
    const context = selecting ? { composition: selected('ddlComposicao'), grade: selected('ddlSerie'), term: selected('ddlBimestre'), shift: selected('ddlTurno'), classroom: selected('ddlTurma'), subject: selected('ddlDisciplina'), assessment: '', total: 0 } : { composition: value('txtComposicao'), grade: value('txtSerie'), term: value('txtBimestre'), shift: value('txtTurno'), classroom: value('txtTurma'), subject: value('txtDisciplina'), assessment: value('avaliacao'), total: Number(value('txtTotaldeQuestoes')) };
    if (selecting ? ['composition','grade','shift','classroom'].some(k => !context[k]) : Object.values(context).some(v => !v) || !Number.isInteger(context.total) || context.total > 100) throw new Error('Selecione composição, série, turno e turma no SIAP para iniciar.');
    // Visible header includes school, signed-in teacher and academic year. Do not rely on class name alone.
    const range = doc.createRange(); range.setStart(doc.body, 0); range.setEndBefore(heading);
    const fragment = range.cloneContents();
    fragment.querySelectorAll('script,style,noscript,[hidden],#assistente-siap-root').forEach(el => el.remove());
    const header = fragment.textContent.replace(/\s+/g, ' ').trim();
    if (!header || !/20\d{2}/.test(header)) throw new Error('Não foi possível conferir escola e ano no cabeçalho.');
    const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const scope = JSON.stringify([header, context.composition.replace(/^\d+\s*-\s*/, ''), context.grade, context.shift, context.classroom].map(normalize));
    if (selecting) {
      const subjects = [...(doc.getElementById(prefix + 'ddlDisciplina')?.options || [])].filter(o => !/selecione/i.test(o.textContent) && o.value && !o.disabled).map(o => ({ value: o.value, subject: o.textContent.trim() }));
      return { mode: 'selection', scope, context, subjects, roster: [], base: scope, signature: scope, label: `${context.classroom} · ${context.grade} · ${context.shift}` };
    }
    const roster = [...table.rows].filter(row => row.querySelector('input[type="checkbox"]')).map(row => {
      const label = row.cells[0]?.textContent.replace(/\s+/g, ' ').trim() || '';
      const boxes = [...row.querySelectorAll('input[type="checkbox"]')];
      if (!/^\d+\s*-/.test(label) || boxes.length !== 4 || boxes.some(b => !b.id)) throw new Error('A estrutura da lista mudou. Nenhum lançamento será feito.');
      const unavailable = [...row.querySelectorAll('img')].some(i => /transfer|inativ|aband|cancel|falec/i.test([i.title, i.alt].join(' '))) || boxes.every(b => b.disabled);
      return { id: label, name: label.replace(/^\d+\s*-\s*/, ''), unavailable, row, boxes };
    });
    if (!roster.length || new Set(roster.map(r => r.id)).size !== roster.length) throw new Error('Lista de estudantes vazia ou duplicada.');
    const base = JSON.stringify({ header, ...context, subject: undefined, total: undefined, roster: roster.map(r => [r.id, r.unavailable]) });
    const block = {year:header.match(/20\d{2}/)?.[0],term:context.term.match(/[1-4]/)?.[0],assessment:context.assessment};
    return { mode: 'entry', block, scope, context, roster, base, signature: JSON.stringify([base, context.subject, context.total]), label: `${context.classroom} · ${context.grade} · ${context.shift} · ${context.term} · ${context.assessment}` };
  }
  function controls(snapshot, id, call) {
    if (![1, 2].includes(call)) throw new Error('Selecione a primeira ou segunda chamada.');
    const student = snapshot.roster.find(r => r.id === id);
    if (!student || student.unavailable) throw new Error('Aluno indisponível.');
    const [firstPresent, firstAbsent, secondPresent, secondAbsent] = student.boxes;
    const [present, absent] = call === 1 ? [firstPresent, firstAbsent] : [secondPresent, secondAbsent];
    if (present.disabled || absent.disabled) throw new Error('Chamada bloqueada no SIAP.');
    const fields = [...(student.row.cells[5]?.querySelectorAll('input:not([type=hidden])') || [])].filter(i => ['text', 'number', 'tel'].includes(i.type));
    if (fields.length > 1) throw new Error('Campo de acertos ambíguo.');
    return { present, absent, otherPresent: call === 1 ? secondPresent : firstPresent, field: fields[0] || null };
  }
  function preflight(snapshot, entries, call) {
    if (!entries.length) throw new Error('Não há resultados selecionados.');
    const seen = new Set();
    for (const entry of entries) {
      if (seen.has(entry.id)) throw new Error('Aluno repetido no lote.'); seen.add(entry.id);
      const c = controls(snapshot, entry.id, call);
      // The confirmed correction is the source of truth for the selected
      // student and call. Existing SIAP values are deliberately replaced by
      // the reviewed batch; unavailable or ambiguous controls still block.
      if (entry.present && (!Number.isInteger(entry.correct) || entry.correct < 0 || entry.correct > snapshot.context.total)) throw new Error('Total de acertos inválido.');
    }
  }
  return Object.freeze({ route, selectionRoute, snapshot, controls, preflight });
});
