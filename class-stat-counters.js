document.addEventListener('DOMContentLoaded', () => {
  // Os contadores acompanham a turma selecionada, sem considerar a busca por
  // nome. Ao retornar para "Todos os alunos", eles mostram a escola inteira.
  const paintClassCounters = () => {
    const total = document.getElementById('total');
    const reports = document.getElementById('reports');
    if (!total || !reports || !Array.isArray(students)) return;

    const scope = selectedClassId
      ? students.filter(student => student.classId === selectedClassId)
      : students;

    total.textContent = scope.length;
    reports.textContent = scope.filter(student => !!student.report).length;
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
  paintClassCounters();
});
