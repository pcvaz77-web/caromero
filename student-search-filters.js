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
      <span class="quick-favorite-filters" id="quickFavoriteFilters"></span>
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
    .quick-favorite-filters { display:contents; }
    body #quickFilters [data-favorite-position="1"] { border-color:#c8e6d6!important; background:#f1faf5!important; color:#286e51!important; }
    body #quickFilters [data-favorite-position="2"] { border-color:#eadfbd!important; background:#fffaf0!important; color:#80632f!important; }
    body #quickFilters [data-favorite-position="3"] { border-color:#ecd2d8!important; background:#fff4f6!important; color:#944858!important; }
    .quick-filter-more[aria-expanded="true"] .quick-filter-arrow { transform:rotate(180deg); }
    .more-filters-panel { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; padding:12px; border:1px solid var(--line); border-radius:10px; background:#f8faff; }
    .more-filters-empty { color:var(--muted); font-size:13px; }
    .quick-filter-settings { flex-basis:100%; display:grid; gap:10px; padding-top:10px; border-top:1px solid var(--line); }
    .quick-filter-settings summary { cursor:pointer; color:var(--blue); font-weight:800; }
    .quick-filter-settings-options { display:flex; flex-wrap:wrap; gap:8px 14px; }
    .quick-filter-settings-options label { display:flex; align-items:center; gap:6px; font-size:13px; }
    .quick-filter-settings-options input { width:17px; height:17px; }
    .quick-filter-settings-actions { display:flex; flex-wrap:wrap; gap:8px; }
    .quick-filter-settings-status { color:var(--muted); font-size:12px; }
    .quick-filter-result { margin-top:10px; font-size:13px; font-weight:700; color:var(--muted); }
    .student-load-more { display:flex; justify-content:center; padding:18px 0 12px; }
    .student-load-more .btn { min-width:230px; }
    .student-load-more span { color:var(--muted); font-size:11px; }
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
  let catalogLoadToken = 0;
  const DEFAULT_FAVORITE_KEYS = ['laudo','nao_alfabetizado','ocorrencia'];
  let favoriteStoredKeys = [...DEFAULT_FAVORITE_KEYS];
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
  const SYSTEM_FILTERS = [
    { key:'laudo', label:'Com laudo' },
    { key:'nao_alfabetizado', label:'Não alfabetizado' },
    { key:'ocorrencia', label:'Com ocorrência', requiresOccurrences:true },
    { key:'attendance:absent', status:'absent', label:'Faltoso' },
    { key:'attendance:active_search', status:'active_search', label:'Necessita de Busca Ativa' }
  ];

  const studentMatchesKey = (student, key) => {
    if (key === 'laudo') return typeof window.studentHasPositiveLaudo === 'function' && window.studentHasPositiveLaudo(student.report);
    if (key === 'nao_alfabetizado') return observationValuesOf(student).includes('Não alfabetizado');
    if (key === 'ocorrencia') return !!window.occurrenceStudentIds?.has(student.id);
    if (key.startsWith('attendance:')) return window.getSiapAttendanceStatus?.(student.id) === key.slice(11);
    if (key.startsWith('obs:')) return observationValuesOf(student).includes(key.slice(4));
    return true;
  };

  // Ponto único lido por render() (index.html) antes de desenhar os cards —
  // os filtros reduzem o conjunto ANTES da renderização, nunca escondem
  // cards já desenhados.
  window.matchesQuickFilters = student => !activeQuickFilter || studentMatchesKey(student, activeQuickFilter);

  async function loadObservationCatalog() {
    const loadToken=++catalogLoadToken;
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId) { observationCatalog = []; favoriteStoredKeys=[...DEFAULT_FAVORITE_KEYS]; observationCatalogLoaded = true; renderChipCounts(); return; }
    let query = db.from('observation_options').select('id,label').order('display_order').order('created_at');
    query = query.eq('school_id', schoolId);
    const { data, error } = await query;
    if (error||loadToken!==catalogLoadToken||window.getActiveSchoolId?.()!==schoolId) return;
    observationCatalog = data || [];
    const { data:settings, error:settingsError } = await db.from('school_quick_filter_favorites')
      .select('favorite_1,favorite_2,favorite_3').eq('school_id',schoolId).maybeSingle();
    if(loadToken!==catalogLoadToken||window.getActiveSchoolId?.()!==schoolId)return;
    favoriteStoredKeys=!settingsError&&settings
      ? [settings.favorite_1,settings.favorite_2,settings.favorite_3]
      : [...DEFAULT_FAVORITE_KEYS];
    observationCatalogLoaded = true;
    renderChipCounts();
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
      button.classList.toggle('active', activeQuickFilter === button.dataset.filterKey);
    });
    // Indica no próprio botão "Mais filtros" que a seleção ativa veio de lá,
    // mesmo com o painel fechado.
    const activeIsFavorite=favoriteStoredKeys.map(resolvedFilter).some(option=>option?.key===activeQuickFilter);
    document.getElementById('moreFiltersButton')?.classList.toggle('active', !!activeQuickFilter&&!activeIsFavorite);
  }

  // Rótulos que nunca aparecem em "Mais filtros": "Não alfabetizado" já tem
  // atalho rápido próprio (evita o mesmo rótulo duplicado em dois lugares);
  // "Representante de turma" tem tratamento/destaque próprio no Carômetro e
  // foi decidido explicitamente que não vira filtro. Isto só afeta a
  // apresentação deste painel — observation_options continua sendo a única
  // fonte de verdade, e o armazenamento/badge/contagem no atalho rápido de
  // "Não alfabetizado" não são tocados por esta lista.
  const MORE_FILTERS_HIDDEN_LABELS = new Set(['Laudo (DI)', 'Laudo (TEA)', 'Não alfabetizado', 'Representante de turma']);

  const resolvedFilter = storedKey => {
    const system=SYSTEM_FILTERS.find(option=>option.key===storedKey);
    if(system)return {...system,storedKey};
    if(!storedKey?.startsWith('obsid:'))return null;
    const observation=observationCatalog.find(option=>option.id===storedKey.slice(6));
    return observation?{storedKey,key:`obs:${observation.label}`,label:observation.label}:null;
  };

  const availableFavoriteFilters = () => [
    ...SYSTEM_FILTERS,
    ...observationCatalog.filter(option=>!MORE_FILTERS_HIDDEN_LABELS.has(option.label)).map(option=>({storedKey:`obsid:${option.id}`,key:`obs:${option.label}`,label:option.label}))
  ].map(option=>({...option,storedKey:option.storedKey||option.key}));

  const visibleFilter = option => !!option && (!option.requiresOccurrences || !!window.canViewOccurrences?.());
  const filterCount = (option,scope) => scope.filter(student=>studentMatchesKey(student,option.key)).length;
  const canConfigureFavorites = () => permission?.role==='admin' || !!permission?.is_coordinator;

  function renderFavoriteFilters(scope) {
    const target=document.getElementById('quickFavoriteFilters');
    if(!target)return;
    target.innerHTML=favoriteStoredKeys.map((storedKey,index)=>({option:resolvedFilter(storedKey),position:index+1})).filter(item=>visibleFilter(item.option)).map(({option,position})=>
      `<button type="button" class="quick-filter-chip ${activeQuickFilter===option.key?'active':''}" data-favorite-position="${position}" data-quick-filter="${esc(option.key)}">${esc(option.label)} <span class="quick-filter-count">${filterCount(option,scope)}</span></button>`
    ).join('');
  }

  function renderMoreFiltersPanel() {
    const panel = document.getElementById('moreFiltersPanel');
    if (!panel) return;
    const scope = scopedStudents();
    if (!observationCatalogLoaded) { panel.innerHTML = '<span class="more-filters-empty">Carregando observações…</span>'; return; }
    const favoriteSet=new Set(favoriteStoredKeys);
    const available=availableFavoriteFilters();
    const remaining=available.filter(option=>visibleFilter(option)&&!favoriteSet.has(option.storedKey));
    const filtersHtml=remaining.map(option=>
      `<button type="button" class="quick-filter-chip more-filter-chip ${activeQuickFilter===option.key?'active':''}" data-filter-key="${esc(option.key)}">${esc(option.label)} <span class="quick-filter-count">${filterCount(option,scope)}</span></button>`
    ).join('')||'<span class="more-filters-empty">Todos os filtros disponíveis estão nos favoritos.</span>';
    const settingsHtml=canConfigureFavorites()?`<details class="quick-filter-settings"><summary>Configurar os 3 favoritos</summary><div class="quick-filter-settings-options">${available.map(option=>`<label><input type="checkbox" data-favorite-choice="${esc(option.storedKey)}" ${favoriteSet.has(option.storedKey)?'checked':favoriteSet.size>=3?'disabled':''}> ${esc(option.label)}</label>`).join('')}</div><div class="quick-filter-settings-actions"><button type="button" class="btn primary" data-save-favorites>Salvar 3 favoritos</button><button type="button" class="btn secondary" data-default-favorites>Usar favoritos padrão</button></div><span class="quick-filter-settings-status" data-favorite-status>Selecione exatamente 3 filtros.</span></details>`:'';
    panel.innerHTML=filtersHtml+settingsHtml;
  }

  // Os números dos botões (Todos/Com laudo/Não alfabetizado/Com ocorrência e
  // cada opção de "Mais filtros") representam sempre o ESCOPO selecionado
  // (turma/turno), independente de busca por nome ou de outros filtros
  // rápidos já ativos — por isso são recalculados aqui, não a partir do
  // resultado final de render().
  function renderChipCounts() {
    const scope = scopedStudents();
    document.getElementById('qfCountAll').textContent = scope.length;
    if (!window.canViewOccurrences?.()&&activeQuickFilter==='ocorrencia') activeQuickFilter=null;

    renderFavoriteFilters(scope);
    renderMoreFiltersPanel();
    syncChipActiveStates();
  }

  function updateResultLine() {
    const resultEl = document.getElementById('quickFilterResult');
    if (!resultEl) return;
    const count = Number.parseInt(list.dataset.resultCount || '', 10);
    const resultCount = Number.isFinite(count) ? count : list.querySelectorAll('.student').length;
    resultEl.textContent = resultCount === 1 ? '1 aluno encontrado' : `${resultCount} alunos encontrados`;
  }

  bar.addEventListener('click', async event => {
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
      window.resetStudentRenderLimit?.();
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
      window.resetStudentRenderLimit?.();
      window.render();
      return;
    }
    const saveFavorites = event.target.closest('[data-save-favorites]');
    if(saveFavorites){
      const selected=[...bar.querySelectorAll('[data-favorite-choice]:checked')].map(input=>input.dataset.favoriteChoice);
      const status=bar.querySelector('[data-favorite-status]');
      if(selected.length!==3){status.textContent='Selecione exatamente 3 filtros.';return;}
      saveFavorites.disabled=true;
      const schoolId=window.getActiveSchoolId?.();
      const {error}=await db.from('school_quick_filter_favorites').upsert({school_id:schoolId,favorite_1:selected[0],favorite_2:selected[1],favorite_3:selected[2]},{onConflict:'school_id'});
      saveFavorites.disabled=false;
      if(error){status.textContent=`Não foi possível salvar: ${error.message}`;return;}
      favoriteStoredKeys=selected;window.render?.();toast('Filtros favoritos atualizados para esta escola.');return;
    }
    const defaultFavorites = event.target.closest('[data-default-favorites]');
    if(defaultFavorites){
      defaultFavorites.disabled=true;
      const schoolId=window.getActiveSchoolId?.();
      const {error}=await db.from('school_quick_filter_favorites').delete().eq('school_id',schoolId);
      defaultFavorites.disabled=false;
      const status=bar.querySelector('[data-favorite-status]');
      if(error){status.textContent=`Não foi possível restaurar: ${error.message}`;return;}
      favoriteStoredKeys=[...DEFAULT_FAVORITE_KEYS];window.render?.();toast('Filtros favoritos padrão restaurados.');return;
    }
    const obsButton = event.target.closest('.more-filter-chip');
    if (obsButton) {
      const key = obsButton.dataset.filterKey;
      activeQuickFilter = activeQuickFilter === key ? null : key;
      syncChipActiveStates();
      // Selecionar uma observação aplica o filtro e fecha o painel.
      document.getElementById('moreFiltersPanel').classList.add('hidden');
      document.getElementById('moreFiltersButton').setAttribute('aria-expanded', 'false');
      window.resetStudentRenderLimit?.();
      window.render();
    }
  });

  bar.addEventListener('change',event=>{
    if(!event.target.matches('[data-favorite-choice]'))return;
    const choices=[...bar.querySelectorAll('[data-favorite-choice]')];
    const selected=choices.filter(input=>input.checked);
    choices.forEach(input=>{input.disabled=selected.length>=3&&!input.checked;});
    const status=bar.querySelector('[data-favorite-status]');
    if(status)status.textContent=selected.length===3?'3 filtros selecionados.':`Selecione mais ${3-selected.length}.`;
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
  document.addEventListener('carometro:quick-filter-favorites-changed', loadObservationCatalog);
  document.addEventListener('carometro:occurrence-labels-changed', () => { renderChipCounts(); window.render?.(); });
  // A origem do evento já redesenha os cards uma vez. Aqui atualizamos apenas
  // os contadores, evitando reconstruir centenas de alunos pela segunda vez.
  document.addEventListener('carometro:attendance-status-changed', renderChipCounts);
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
