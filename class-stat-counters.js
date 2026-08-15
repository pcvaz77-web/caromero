document.addEventListener('DOMContentLoaded', () => {
  // Os contadores acompanham a turma selecionada, sem considerar a busca por
  // nome. Ao retornar para "Todos os alunos", eles mostram a escola inteira.
  let lastCounterRequest = 0;
  const countStudents = classId => {
    let query = db.from('students').select('id', { count:'exact', head:true });
    if (classId) query = query.eq('class_id', classId);
    return query;
  };
  const hasPositiveLaudo = value => {
    if (typeof window.studentHasPositiveLaudo === 'function') return window.studentHasPositiveLaudo(value);
    const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let values;
    try { const parsed = JSON.parse(value || '[]'); values = Array.isArray(parsed) ? parsed : [value]; }
    catch { values = [value]; }
    const negative = /\b(sem|nao|nem|nenhum|nenhuma|ausencia|ausente|inexistente|negativo|negativa|negado|negada|falta|faltando|isento|isenta|dispensado|dispensada|aguardando|pendente)\b/;
    return values.some(item => { const text = normalize(item); return /\blaudo\b/.test(text) && !negative.test(text); });
  };
  const loadReportValues = async classId => {
    const rows = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      let query = db.from('students').select('id,has_report').order('id').range(from, from + pageSize - 1);
      if (classId) query = query.eq('class_id', classId);
      const { data, error } = await query;
      if (error) return { data:null, error };
      rows.push(...(data || []));
      if (!data || data.length < pageSize) return { data:rows, error:null };
    }
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
    reports.textContent = scope.filter(student => hasPositiveLaudo(student.report)).length;
    const requestId = ++lastCounterRequest;
    const [totalResult, reportsResult] = await Promise.all([
      countStudents(activeClassId),
      loadReportValues(activeClassId)
    ]);
    if (requestId !== lastCounterRequest) return;
    // Algumas configurações de RLS devolvem count=0 em consultas HEAD mesmo
    // quando as linhas já foram carregadas normalmente. Não deixe esse falso
    // zero apagar a contagem confiável que está em memória.
    if (typeof totalResult.count === 'number' && (totalResult.count > 0 || scope.length === 0)) total.textContent = totalResult.count;
    if (reportsResult.data) reports.textContent = reportsResult.data.filter(row => hasPositiveLaudo(row.has_report)).length;
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
    if (!event.target.closest('[data-class-id], #studentsNav')) return;
    window.setTimeout(paintClassCounters, 0);
  });
  paintClassCounters();
});
