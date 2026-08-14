document.addEventListener('DOMContentLoaded', () => {
  // Os contadores acompanham a turma selecionada, sem considerar a busca por
  // nome. Ao retornar para "Todos os alunos", eles mostram a escola inteira.
  let lastCounterRequest = 0;
  const countStudents = (classId, withReport = false) => {
    let query = db.from('students').select('id', { count:'exact', head:true });
    if (classId) query = query.eq('class_id', classId);
    if (withReport) query = query.not('has_report', 'is', null).neq('has_report', '');
    return query;
  };

  const paintClassCounters = async classId => {
    const total = document.getElementById('total');
    const reports = document.getElementById('reports');
    if (!total || !reports || !Array.isArray(students)) return;

    const activeClassId = classId === undefined ? selectedClassId : classId;
    const scope = activeClassId
      ? students.filter(student => student.classId === activeClassId)
      : students;

    // Mostra imediatamente o que já está em memória e, em seguida, substitui
    // pela contagem exata do banco. A lista pode ter paginação; o contador não.
    total.textContent = scope.length;
    reports.textContent = scope.filter(student => !!student.report).length;
    const requestId = ++lastCounterRequest;
    const [totalResult, reportsResult] = await Promise.all([
      countStudents(activeClassId),
      countStudents(activeClassId, true)
    ]);
    if (requestId !== lastCounterRequest) return;
    if (typeof totalResult.count === 'number') total.textContent = totalResult.count;
    if (typeof reportsResult.count === 'number') reports.textContent = reportsResult.count;
  };

  const originalRender = window.render;
  if (typeof originalRender === 'function') {
    window.render = (...args) => {
      const result = originalRender(...args);
      paintClassCounters();
      return result;
    };
  }

  document.addEventListener('carometro:data-loaded', paintClassCounters);
  document.addEventListener('carometro:class-selected', event => {
    paintClassCounters(event.detail?.classId || null);
  });
  // As turmas de Matutino/Vespertino/Noturno são criadas dinamicamente.
  // Atualize após o clique desses botões e após voltar a Todos os alunos.
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-class-id], #studentsNav')) return;
    window.setTimeout(paintClassCounters, 0);
  });
  paintClassCounters();
});
