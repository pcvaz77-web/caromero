document.addEventListener('DOMContentLoaded', () => {
  const head = document.querySelector('.panel .head');
  const list = document.getElementById('list');
  if (!head || !list) return;

  const bar = document.createElement('div');
  bar.id = 'quickFilters';
  bar.className = 'quick-filters';
  bar.innerHTML = `
    <div class="quick-filters-row" id="quickFiltersRow">
      <button type="button" class="quick-filter-chip active" data-quick-filter="all">Todos <span class="quick-filter-count" id="qfCountAll">0</span></button>
      <button type="button" class="quick-filter-chip" data-quick-filter="laudo">Com laudo <span class="quick-filter-count" id="qfCountLaudo">0</span></button>
      <button type="button" class="quick-filter-chip" data-quick-filter="nao_alfabetizado">Não alfabetizado <span class="quick-filter-count" id="qfCountIlliterate">0</span></button>
      <button type="button" class="quick-filter-chip hidden" id="qfOccurrenceChip" data-quick-filter="ocorrencia">Com ocorrência <span class="quick-filter-count" id="qfCountOccurrence">0</span></button>
      <button type="button" class="quick-filter-chip quick-filter-more" id="moreFiltersButton" aria-expanded="false">Mais filtros <span class="quick-filter-arrow">⌄</span></button>
    </div>
    <div id="moreFiltersPanel" class="more-filters-panel hidden"></div>
    <div id="quickFilterResult" class="quick-filter-result"></div>
  `;
  head.after(bar);

  const style = document.createElement('style');
  style.textContent = `
    .quick-filters { padding:0 22px 14px; }
    .quick-filters-row { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .quick-filter-chip { min-height:36px; padding:7px 13px; border-radius:99px; border:1px solid var(--line); background:#fff; color:#344054; font-size:13px; font-weight:700; display:inline-flex; align-items:center; gap:6px; }
    .quick-filter-chip:hover { border-color:#c3cee0; }
    .quick-filter-chip.active { background:var(--navy); border-color:var(--navy); color:#fff; }
    .quick-filter-count { font-size:11px; font-weight:800; opacity:.75; }
    .quick-filter-more { background:#f4f7ff; border-color:#dbe4f5; color:var(--blue); }
    .quick-filter-more[aria-expanded="true"] { background:var(--blue); border-color:var(--blue); color:#fff; }
    .quick-filter-more .quick-filter-arrow { transition:transform .15s ease; }
    .quick-filter-more[aria-expanded="true"] .quick-filter-arrow { transform:rotate(180deg); }
    .more-filters-panel { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; padding:12px; border:1px solid var(--line); border-radius:10px; background:#f8faff; }
    .more-filters-empty { color:var(--muted); font-size:13px; }
    .quick-filter-result { margin-top:10px; font-size:13px; font-weight:700; color:var(--muted); }
    @media(max-width:800px) {
      .quick-filters { padding:0 17px 12px; }
      .quick-filters-row { flex-wrap:nowrap; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
      .quick-filters-row::-webkit-scrollbar { display:none; }
      .quick-filter-chip { flex:none; white-space:nowrap; }
    }
  `;
  document.head.appendChild(style);

  // observation_options é a única fonte de rótulos, tanto para os padrão
  // quanto para os cadastrados pelo administrador em "Gerenciar
  // observações" — nenhuma lista fixa paralela é mantida aqui.
  let observationCatalog = [];
  let observationCatalogLoaded = false;
  // Apenas um filtro rápido (ou uma observação de "Mais filtros") ativo por
  // vez — selecionar um novo sempre substitui o anterior, nunca combina com
  // ele. Continua combinando normalmente com escopo (turma/turno) e busca
  // por nome, que são estados independentes. Chaves fixas: 'laudo',
  // 'nao_alfabetizado', 'ocorrencia'. Rótulos vindos de observation_options
  // entram prefixados com "obs:" para não colidir com essas chaves fixas.
  let activeQuickFilter = null;

  const classShiftMap = () => new Map(classes.map(c => [c.id, c.shift || 'Matutino']));

  // Mesmo conjunto que render() usa para escopo (turma/turno), sem busca por
  // nome nem filtros rápidos — é a base sobre a qual todos os contadores dos
  // botões são calculados, conforme pedido: eles refletem o escopo, não o
  // resultado já filtrado.
  const scopedStudents = () => {
    const shiftById = classShiftMap();
    return students.filter(s => (!selectedClassId || s.classId === selectedClassId) && (!selectedShift || shiftById.get(s.classId) === selectedShift));
  };

  const observationValuesOf = student => (typeof window.decodeObservationValues === 'function' ? window.decodeObservationValues(student.report) : []);

  const studentMatchesKey = (student, key) => {
    if (key === 'laudo') return typeof window.studentHasPositiveLaudo === 'function' && window.studentHasPositiveLaudo(student.report);
    if (key === 'nao_alfabetizado') return observationValuesOf(student).includes('Não alfabetizado');
    if (key === 'ocorrencia') return !!window.occurrenceStudentIds?.has(student.id);
    if (key.startsWith('obs:')) return observationValuesOf(student).includes(key.slice(4));
    return true;
  };

  // Ponto único lido por render() (index.html) antes de desenhar os cards —
  // os filtros reduzem o conjunto ANTES da renderização, nunca escondem
  // cards já desenhados.
  window.matchesQuickFilters = student => !activeQuickFilter || studentMatchesKey(student, activeQuickFilter);

  async function loadObservationCatalog() {
    const { data, error } = await db.from('observation_options').select('id,label').order('display_order').order('created_at');
    if (error) return;
    observationCatalog = data || [];
    observationCatalogLoaded = true;
    renderMoreFiltersPanel();
  }

  function chipButtons() {
    return [...bar.querySelectorAll('.quick-filter-chip[data-quick-filter]')];
  }

  function syncChipActiveStates() {
    chipButtons().forEach(button => {
      const key = button.dataset.quickFilter;
      const isActive = key === 'all' ? !activeQuickFilter : activeQuickFilter === key;
      button.classList.toggle('active', isActive);
    });
    bar.querySelectorAll('.more-filter-chip').forEach(button => {
      button.classList.toggle('active', activeQuickFilter === button.dataset.obsFilter);
    });
    // Indica no próprio botão "Mais filtros" que a seleção ativa veio de lá,
    // mesmo com o painel fechado.
    document.getElementById('moreFiltersButton')?.classList.toggle('active', !!activeQuickFilter && activeQuickFilter.startsWith('obs:'));
  }

  // Rótulos que nunca aparecem em "Mais filtros": "Não alfabetizado" já tem
  // atalho rápido próprio (evita o mesmo rótulo duplicado em dois lugares);
  // "Representante de turma" tem tratamento/destaque próprio no Carômetro e
  // foi decidido explicitamente que não vira filtro. Isto só afeta a
  // apresentação deste painel — observation_options continua sendo a única
  // fonte de verdade, e o armazenamento/badge/contagem no atalho rápido de
  // "Não alfabetizado" não são tocados por esta lista.
  const MORE_FILTERS_HIDDEN_LABELS = new Set(['Não alfabetizado', 'Representante de turma']);

  function renderMoreFiltersPanel() {
    const panel = document.getElementById('moreFiltersPanel');
    if (!panel) return;
    const scope = scopedStudents();
    if (!observationCatalogLoaded) { panel.innerHTML = '<span class="more-filters-empty">Carregando observações…</span>'; return; }
    const visibleCatalog = observationCatalog.filter(option => !MORE_FILTERS_HIDDEN_LABELS.has(option.label));
    if (!visibleCatalog.length) { panel.innerHTML = '<span class="more-filters-empty">Nenhuma observação cadastrada.</span>'; return; }
    panel.innerHTML = visibleCatalog.map(option => {
      const count = scope.filter(s => observationValuesOf(s).includes(option.label)).length;
      const key = `obs:${option.label}`;
      return `<button type="button" class="quick-filter-chip more-filter-chip ${activeQuickFilter === key ? 'active' : ''}" data-obs-filter="${key}">${esc(option.label)} <span class="quick-filter-count">${count}</span></button>`;
    }).join('');
  }

  // Os números dos botões (Todos/Com laudo/Não alfabetizado/Com ocorrência e
  // cada opção de "Mais filtros") representam sempre o ESCOPO selecionado
  // (turma/turno), independente de busca por nome ou de outros filtros
  // rápidos já ativos — por isso são recalculados aqui, não a partir do
  // resultado final de render().
  function renderChipCounts() {
    const scope = scopedStudents();
    document.getElementById('qfCountAll').textContent = scope.length;
    document.getElementById('qfCountLaudo').textContent = scope.filter(s => typeof window.studentHasPositiveLaudo === 'function' && window.studentHasPositiveLaudo(s.report)).length;
    document.getElementById('qfCountIlliterate').textContent = scope.filter(s => observationValuesOf(s).includes('Não alfabetizado')).length;

    const occurrenceChip = document.getElementById('qfOccurrenceChip');
    const canSeeOccurrences = !!window.canViewOccurrences?.();
    occurrenceChip.classList.toggle('hidden', !canSeeOccurrences);
    if (canSeeOccurrences) {
      document.getElementById('qfCountOccurrence').textContent = scope.filter(s => window.occurrenceStudentIds?.has(s.id)).length;
    } else {
      // Não deixe a última contagem calculada sobreviver escondida no DOM
      // depois que a permissão for revogada — o elemento fica oculto pela
      // classe acima, mas o valor em si também precisa deixar de existir.
      document.getElementById('qfCountOccurrence').textContent = '';
      // A permissão pode ter sido revogada durante a sessão (evento
      // carometro:permission-refresh). Nunca deixe um filtro que o usuário
      // não pode mais usar continuar aplicado silenciosamente.
      if (activeQuickFilter === 'ocorrencia') activeQuickFilter = null;
    }

    renderMoreFiltersPanel();
    syncChipActiveStates();
  }

  function updateResultLine() {
    const resultEl = document.getElementById('quickFilterResult');
    if (!resultEl) return;
    const count = list.querySelectorAll('.student').length;
    resultEl.textContent = count === 1 ? '1 aluno encontrado' : `${count} alunos encontrados`;
  }

  bar.addEventListener('click', event => {
    const moreButton = event.target.closest('#moreFiltersButton');
    if (moreButton) {
      const panel = document.getElementById('moreFiltersPanel');
      // O painel usa a mesma classe utilitária "hidden" do resto do
      // Carômetro (display:none!important) — precisa ser essa classe que é
      // alternada, não a propriedade/atributo nativo "hidden" do elemento,
      // que é um mecanismo independente e não tinha nenhum efeito visual
      // aqui (essa era a causa do clique não abrir nada).
      const opening = panel.classList.contains('hidden');
      panel.classList.toggle('hidden', !opening);
      moreButton.setAttribute('aria-expanded', String(opening));
      return;
    }
    const allButton = event.target.closest('.quick-filter-chip[data-quick-filter="all"]');
    if (allButton) {
      // "Todos" limpa só o filtro rápido ativo — turma/turno e busca por
      // nome continuam exatamente como estavam.
      activeQuickFilter = null;
      syncChipActiveStates();
      window.render();
      return;
    }
    const fixedButton = event.target.closest('.quick-filter-chip[data-quick-filter]:not([data-quick-filter="all"])');
    if (fixedButton) {
      const key = fixedButton.dataset.quickFilter;
      if (key === 'ocorrencia' && !window.canViewOccurrences?.()) return;
      // Selecionar um novo filtro rápido sempre substitui o anterior — nunca
      // combina dois ao mesmo tempo. Clicar de novo no que já está ativo
      // desativa, voltando a "Todos".
      activeQuickFilter = activeQuickFilter === key ? null : key;
      syncChipActiveStates();
      window.render();
      return;
    }
    const obsButton = event.target.closest('.more-filter-chip');
    if (obsButton) {
      const key = obsButton.dataset.obsFilter;
      activeQuickFilter = activeQuickFilter === key ? null : key;
      syncChipActiveStates();
      // Selecionar uma observação aplica o filtro e fecha o painel.
      document.getElementById('moreFiltersPanel').classList.add('hidden');
      document.getElementById('moreFiltersButton').setAttribute('aria-expanded', 'false');
      window.render();
    }
  });

  // Clicar fora do botão/painel de "Mais filtros" fecha o painel — mesmo
  // padrão já usado pelo painel de notificações (notification-center.js).
  document.addEventListener('click', event => {
    const panel = document.getElementById('moreFiltersPanel');
    if (!panel || panel.classList.contains('hidden')) return;
    if (event.target.closest('#moreFiltersPanel, #moreFiltersButton')) return;
    panel.classList.add('hidden');
    document.getElementById('moreFiltersButton').setAttribute('aria-expanded', 'false');
  });

  const originalRender = window.render;
  if (typeof originalRender === 'function') {
    window.render = (...args) => {
      const result = originalRender(...args);
      renderChipCounts();
      updateResultLine();
      return result;
    };
  }

  document.addEventListener('carometro:data-loaded', () => { loadObservationCatalog(); renderChipCounts(); updateResultLine(); });
  document.addEventListener('carometro:observations-changed', loadObservationCatalog);
  document.addEventListener('carometro:occurrence-labels-changed', () => { renderChipCounts(); window.render?.(); });
  document.addEventListener('carometro:permission-refresh', () => { renderChipCounts(); window.render?.(); });
  document.addEventListener('carometro:class-selected', () => renderChipCounts());

  // `$('search').oninput=render` (index.html) foi atribuído antes deste
  // arquivo envolver window.render(), então continua chamando só a versão
  // original — a lista já filtra certo, mas renderChipCounts()/
  // updateResultLine() nunca rodavam ao digitar. Escutar o mesmo evento
  // aqui, à parte, corrige isso sem recriar a busca: o input original do
  // Carômetro continua sendo a única fonte de filtragem, só o contador de
  // resultado é atualizado depois que a lista já foi redesenhada. Não chama
  // renderChipCounts() de propósito — os números dos chips e os cards
  // Alunos/Turmas continuam representando só o escopo, nunca a busca.
  document.getElementById('search')?.addEventListener('input', updateResultLine);

  loadObservationCatalog();
});
