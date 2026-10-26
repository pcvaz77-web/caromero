document.addEventListener('DOMContentLoaded', () => {
  const listHead = document.querySelector('#listTitle')?.closest('.head');
  const search = document.getElementById('search');
  if (!listHead || !search || !window.CAROMETRO_RUNTIME_CONFIG?.backendConfigured) return;

  const searchActions = document.createElement('div');
  searchActions.className = 'bulk-name-search-actions';
  search.parentNode.insertBefore(searchActions, search);
  searchActions.appendChild(search);

  const openButton = document.createElement('button');
  openButton.id = 'editBulkStudentNames';
  openButton.type = 'button';
  openButton.className = 'btn primary hidden';
  openButton.textContent = 'Editar vários nomes';
  searchActions.appendChild(openButton);

  const modal = document.createElement('div');
  modal.id = 'bulkStudentNamesModal';
  modal.className = 'modal-bg hidden';
  modal.innerHTML = `<div class="modal bulk-name-dialog" role="dialog" aria-modal="true" aria-labelledby="bulkNameTitle"><div class="modal-head"><div><h3 id="bulkNameTitle">Editar vários nomes</h3><p id="bulkNameClass" class="meta"></p></div><button type="button" class="close" data-bulk-name-close aria-label="Fechar">×</button></div><form id="bulkNameForm" class="form"><p class="sub">Edite os nomes necessários. Apenas os nomes alterados serão salvos.</p><div id="bulkNameRows" class="bulk-name-rows"></div><p id="bulkNameStatus" class="bulk-name-status" role="status" aria-live="polite"></p><div class="actions"><button type="button" class="btn secondary" data-bulk-name-close>Cancelar</button><button id="saveBulkStudentNames" type="submit" class="btn primary">Salvar nomes alterados</button></div></form></div>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `.bulk-name-search-actions{display:flex;align-items:center;gap:9px;min-width:0}.bulk-name-search-actions #search{min-width:0}.bulk-name-search-actions .btn{white-space:nowrap;flex:none}.bulk-name-dialog{width:min(700px,100%)}.bulk-name-dialog .modal-head p{margin:5px 0 0}.bulk-name-rows{display:grid;gap:8px;max-height:min(55vh,540px);overflow:auto;padding:2px 3px 2px 0}.bulk-name-row{display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:10px}.bulk-name-row span{color:var(--muted);font-size:12px;font-weight:750;text-align:right}.bulk-name-row input{min-width:0}.bulk-name-row input[data-changed="true"]{border-color:var(--blue);background:#f5f8ff}.bulk-name-status{min-height:20px;margin:12px 0;color:var(--muted);font-size:13px}.bulk-name-status[data-error="true"]{color:var(--danger)}@media(max-width:800px){.head:has(#editBulkStudentNames){flex-wrap:wrap}.bulk-name-search-actions{width:100%;flex-wrap:wrap}.bulk-name-search-actions #search{flex:1 1 190px}.bulk-name-search-actions .btn{flex:1 1 auto}.bulk-name-dialog{max-height:calc(100dvh - 20px)}.bulk-name-rows{max-height:50dvh}}`;
  document.head.appendChild(style);

  const rowsContainer = modal.querySelector('#bulkNameRows');
  const status = modal.querySelector('#bulkNameStatus');
  const saveButton = modal.querySelector('#saveBulkStudentNames');
  let classId = null;
  let schoolId = null;
  let originalRows = [];
  let saving = false;

  const canUse = () => {
    const role = window.getActiveSchoolRole?.();
    return !!selectedClassId && (role === 'school_admin' || (role === 'coordinator' && (permission?.can_edit_all || permission?.can_edit_name)));
  };
  const syncButton = () => openButton.classList.toggle('hidden', !canUse());
  const normalizedName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
  const cleanName = value => String(value || '').replace(/\s+/g, ' ').trim();
  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.dataset.error = String(error);
  };
  const close = () => {
    if (saving) return;
    modal.classList.add('hidden');
    classId = null;
    schoolId = null;
    originalRows = [];
    openButton.focus();
  };
  modal.querySelectorAll('[data-bulk-name-close]').forEach(button => button.addEventListener('click', close));
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  modal.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

  async function authorized(school) {
    if (!user?.id || !school) return false;
    const { data, error } = await db.from('school_members').select('role,status')
      .eq('school_id', school).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (error || !data) return false;
    return data.role === 'school_admin' || (data.role === 'coordinator' && (permission?.can_edit_all || permission?.can_edit_name));
  }

  async function fetchClassStudents(school, targetClass) {
    const result = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await db.from('students').select('id,full_name')
        .eq('school_id', school).eq('class_id', targetClass).eq('enrollment_status', 'active')
        .order('full_name').order('id').range(start, start + 499);
      if (error) throw error;
      result.push(...(data || []));
      if ((data || []).length < 500) return result;
    }
  }

  openButton.addEventListener('click', async () => {
    if (!canUse()) return;
    const targetClass = selectedClassId;
    const targetSchool = window.getActiveSchoolId?.();
    openButton.disabled = true;
    try {
      if (!await authorized(targetSchool)) throw new Error('Você não tem permissão para editar vários nomes.');
      const rows = await fetchClassStudents(targetSchool, targetClass);
      if (targetClass !== selectedClassId || targetSchool !== window.getActiveSchoolId?.()) return;
      classId = targetClass;
      schoolId = targetSchool;
      originalRows = rows;
      modal.querySelector('#bulkNameClass').textContent = `Turma ${classes.find(item => item.id === classId)?.name || ''} · ${rows.length} aluno${rows.length === 1 ? '' : 's'}`;
      rowsContainer.replaceChildren();
      rows.forEach((row, index) => {
        const label = document.createElement('label');
        label.className = 'bulk-name-row';
        const number = document.createElement('span');
        number.textContent = `${index + 1}.`;
        const input = document.createElement('input');
        input.type = 'text';
        input.required = true;
        input.maxLength = 200;
        input.value = row.full_name;
        input.dataset.studentId = row.id;
        input.setAttribute('aria-label', `Nome do aluno ${index + 1}`);
        label.append(number, input);
        rowsContainer.appendChild(label);
      });
      setStatus(rows.length ? 'Nenhum nome alterado.' : 'Esta turma não tem alunos ativos.');
      saveButton.disabled = rows.length === 0;
      modal.classList.remove('hidden');
      rowsContainer.querySelector('input')?.focus();
    } catch (error) {
      toast(error.message || 'Não foi possível carregar os nomes.');
    } finally {
      openButton.disabled = false;
    }
  });

  rowsContainer.addEventListener('input', () => {
    const originals = new Map(originalRows.map(row => [row.id, row.full_name]));
    let count = 0;
    rowsContainer.querySelectorAll('input').forEach(input => {
      const changed = cleanName(input.value) !== originals.get(input.dataset.studentId);
      input.dataset.changed = String(changed);
      if (changed) count++;
    });
    setStatus(count ? `${count} nome${count === 1 ? '' : 's'} alterado${count === 1 ? '' : 's'}.` : 'Nenhum nome alterado.');
  });

  modal.querySelector('#bulkNameForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !classId || !schoolId || schoolId !== window.getActiveSchoolId?.()) return;
    const originalById = new Map(originalRows.map(row => [row.id, row.full_name]));
    const inputs = [...rowsContainer.querySelectorAll('input')];
    const nextRows = inputs.map(input => ({ id:input.dataset.studentId, oldName:originalById.get(input.dataset.studentId), name:cleanName(input.value), input }));
    const invalid = nextRows.find(row => !row.oldName || row.name.length < 3 || row.name.length > 200);
    if (invalid) { setStatus('Informe um nome completo com pelo menos 3 caracteres.', true); invalid.input.focus(); return; }
    const seen = new Map();
    for (const row of nextRows) {
      const key = normalizedName(row.name);
      const previous = seen.get(key);
      if (previous && (row.name !== row.oldName || previous.name !== previous.oldName)) {
        setStatus('A edição criaria nomes repetidos nesta turma. Corrija antes de salvar.', true);
        row.input.focus();
        return;
      }
      seen.set(key, row);
    }
    const changes = nextRows.filter(row => row.name !== row.oldName);
    if (!changes.length) { setStatus('Nenhum nome foi alterado.'); return; }
    if (!confirm(`Tem certeza que deseja alterar ${changes.length} nome${changes.length === 1 ? '' : 's'}? Apenas os nomes serão modificados.`)) return;

    saving = true;
    saveButton.disabled = true;
    modal.querySelectorAll('[data-bulk-name-close]').forEach(button => { button.disabled = true; });
    let saved = 0;
    try {
      if (!await authorized(schoolId)) throw new Error('Sua permissão de edição não está mais ativa.');
      const current = await fetchClassStudents(schoolId, classId);
      const currentById = new Map(current.map(row => [row.id, row.full_name]));
      if (current.length !== originalRows.length || originalRows.some(row => !currentById.has(row.id))) {
        throw new Error('A lista da turma mudou. Reabra a janela antes de salvar.');
      }
      if (originalRows.some(row => currentById.get(row.id) !== row.full_name)) throw new Error('Um nome foi alterado em outra sessão. Reabra a lista antes de salvar.');
      for (const row of changes) {
        const { data, error } = await db.from('students').update({ full_name:row.name })
          .eq('id', row.id).eq('school_id', schoolId).eq('class_id', classId).eq('full_name', row.oldName)
          .select('id');
        if (error) throw error;
        if (data?.length !== 1) throw new Error('Um aluno mudou durante a edição. Reabra a lista antes de continuar.');
        originalById.set(row.id, row.name);
        const localStudent = students.find(student => student.id === row.id);
        if (localStudent) localStudent.name = row.name;
        saved++;
      }
      originalRows = originalRows.map(row => ({ ...row, full_name:originalById.get(row.id) }));
      render();
      await load();
      toast(`${saved} nome${saved === 1 ? '' : 's'} atualizado${saved === 1 ? '' : 's'}.`);
      modal.classList.add('hidden');
      classId = null;
      schoolId = null;
    } catch (error) {
      originalRows = originalRows.map(row => ({ ...row, full_name:originalById.get(row.id) }));
      if (saved) { render(); await load(); }
      setStatus(`${saved} nome${saved === 1 ? '' : 's'} salvo${saved === 1 ? '' : 's'}. ${error.message || 'Não foi possível concluir os demais.'}`, true);
    } finally {
      saving = false;
      saveButton.disabled = false;
      modal.querySelectorAll('[data-bulk-name-close]').forEach(button => { button.disabled = false; });
    }
  });

  new MutationObserver(syncButton).observe(document.getElementById('listTitle'), { childList:true, characterData:true, subtree:true });
  document.addEventListener('carometro:permission-refresh', syncButton);
  document.addEventListener('carometro:school-context-ready', syncButton);
  syncButton();
});
