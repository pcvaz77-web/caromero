document.addEventListener('DOMContentLoaded', () => {
  // Os dois mostradores do topo (Total de alunos / Turmas cadastradas)
  // acompanham só o ESCOPO selecionado (turma/turno/escola inteira), sem
  // considerar busca por nome nem os filtros rápidos da barra de busca —
  // eles representam o escopo, o resultado da pesquisa fica só no contador
  // "N alunos encontrados" da barra de filtros. Ao retornar para "Todos os
  // alunos", eles mostram a escola inteira.
  const paintClassCounters = classId => {
    const total = document.getElementById('total');
    const classesCountEl = document.getElementById('classesCount');
    if (!total || !classesCountEl || !Array.isArray(students)) return;
    if (!window.getActiveSchoolId?.()) { total.textContent = '0'; classesCountEl.textContent = '0'; return; }

    const activeClassId = classId === undefined ? selectedClassId : classId;
    const activeShift = activeClassId ? null : (typeof selectedShift !== 'undefined' ? selectedShift : null);
    const shiftById = new Map(classes.map(c => [c.id, c.shift || 'Matutino']));
    const scope = activeClassId
      ? students.filter(student => student.classId === activeClassId)
      : activeShift
        ? students.filter(student => shiftById.get(student.classId) === activeShift)
        : students;
    // Mesmas regras de escopo do total de alunos: uma turma específica conta
    // como 1; um turno conta as turmas daquele turno; a escola inteira conta
    // todas. Vem só de `classes`, já carregado sob RLS — nenhuma consulta
    // nova.
    const scopedClassesCount = activeClassId
      ? 1
      : activeShift
        ? classes.filter(item => (item.shift || 'Matutino') === activeShift).length
        : classes.length;

    // window.load busca todas as páginas sob RLS e mantém apenas alunos
    // ativos. Só a renderização dos cards é limitada. Usar essa lista evita
    // repetir COUNT(*) em cada render e incluir matrículas arquivadas no total.
    total.textContent = scope.length;
    classesCountEl.textContent = scopedClassesCount;
  };

  const originalRender = window.render;
  if (typeof originalRender === 'function') {
    window.render = (...args) => {
      const result = originalRender(...args);
      paintClassCounters();
      return result;
    };
  }

  document.addEventListener('carometro:data-loaded', () => paintClassCounters());
  document.addEventListener('carometro:class-selected', event => {
    paintClassCounters(event.detail?.classId || null);
  });
  // As turmas de Matutino/Vespertino/Noturno são criadas dinamicamente.
  // Atualize após o clique desses botões e após voltar a Todos os alunos.
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-class-id], [data-select-shift], [data-all-students]')) return;
    window.setTimeout(paintClassCounters, 0);
  });
  paintClassCounters();
});
