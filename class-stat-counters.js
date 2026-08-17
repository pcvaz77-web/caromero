document.addEventListener('DOMContentLoaded', () => {
  // Os dois mostradores do topo (Total de alunos / Turmas cadastradas)
  // acompanham só o ESCOPO selecionado (turma/turno/escola inteira), sem
  // considerar busca por nome nem os filtros rápidos da barra de busca —
  // eles representam o escopo, o resultado da pesquisa fica só no contador
  // "N alunos encontrados" da barra de filtros. Ao retornar para "Todos os
  // alunos", eles mostram a escola inteira.
  let lastCounterRequest = 0;
  const countStudents = classId => {
    let query = db.from('students').select('id', { count:'exact', head:true });
    if (classId) query = query.eq('class_id', classId);
    return query;
  };

  const paintClassCounters = async classId => {
    const total = document.getElementById('total');
    const classesCountEl = document.getElementById('classesCount');
    if (!total || !classesCountEl || !Array.isArray(students)) return;

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

    // Mostra imediatamente o que já está em memória e, em seguida, substitui
    // o total de alunos pela contagem exata do banco. A lista pode ter
    // paginação; o contador não. Turmas cadastradas nunca é paginado, então
    // fica só com o valor em memória.
    total.textContent = scope.length;
    classesCountEl.textContent = scopedClassesCount;

    // Escopo de turno inteiro: a contagem em memória acima já vem de uma
    // consulta real sob RLS (window.load), então não repete uma segunda
    // consulta ao banco só para esse caso — mesma garantia de autoridade da
    // RLS, sem tráfego extra.
    if (activeShift) return;

    const requestId = ++lastCounterRequest;
    const totalResult = await countStudents(activeClassId);
    if (requestId !== lastCounterRequest) return;
    // Algumas configurações de RLS devolvem count=0 em consultas HEAD mesmo
    // quando as linhas já foram carregadas normalmente. Não deixe esse falso
    // zero apagar a contagem confiável que está em memória.
    if (typeof totalResult.count === 'number' && (totalResult.count > 0 || scope.length === 0)) total.textContent = totalResult.count;
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
