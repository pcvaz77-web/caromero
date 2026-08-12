document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  const uniformButton = document.createElement('button');
  uniformButton.id = 'uniformNav';
  uniformButton.type = 'button';
  uniformButton.innerHTML = '<span>▣ &nbsp; Uniforme</span>';
  const profileButton = document.getElementById('profileNav');
  nav.insertBefore(uniformButton, profileButton || null);

  const modal = document.createElement('div');
  modal.id = 'uniformModal';
  modal.className = 'modal-bg uniform-modal hidden';
  modal.innerHTML = `
    <section class="modal uniform-dialog" role="dialog" aria-modal="true" aria-labelledby="uniformTitle">
      <div class="modal-head"><div><h3 id="uniformTitle">Controle de uniforme</h3><div class="meta">Acompanhe as entregas de uniforme e tênis por aluno.</div></div><button type="button" class="close" id="closeUniform" aria-label="Fechar">×</button></div>
      <div class="uniform-summary"><div><span>Pendentes de uniforme</span><b id="uniformPendingCount">0</b></div><div><span>Pendentes de tênis</span><b id="shoesPendingCount">0</b></div><div><span>Pendentes dos dois</span><b id="bothPendingCount">0</b></div></div>
      <div class="uniform-controls"><select id="uniformClassFilter"><option value="">Todas as turmas</option></select><select id="uniformStatusFilter"><option value="pending-any">Não receberam uniforme e/ou tênis</option><option value="pending-uniform">Não receberam uniforme</option><option value="pending-shoes">Não receberam tênis</option><option value="pending-both">Não receberam os dois</option><option value="all">Todos os alunos</option></select><input id="uniformSearch" placeholder="Buscar aluno"></div>
      <div id="uniformList" class="uniform-list"></div>
    </section>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    #uniformNav { border:0; background:#2b3c5d; color:#fff; }
    #uniformNav:hover, #uniformNav:focus { background:#38527e; color:#fff; }
    .uniform-modal { z-index:110; padding:20px; overscroll-behavior:none; }
    .uniform-dialog { width:min(1000px,100%); max-height:calc(100dvh - 40px); display:flex; flex-direction:column; overflow:hidden; }
    .uniform-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; padding:16px 22px; border-bottom:1px solid var(--line); background:#f8faff; }
    .uniform-summary div { min-width:0; padding:12px; border-radius:10px; background:#fff; border:1px solid #dbe4f5; }
    .uniform-summary span { display:block; color:var(--muted); font-size:12px; font-weight:700; }
    .uniform-summary b { display:block; margin-top:4px; color:#b42318; font-size:25px; }
    .uniform-controls { display:grid; grid-template-columns:minmax(160px,.8fr) minmax(240px,1.25fr) minmax(160px,.8fr); gap:10px; padding:16px 22px; }
    .uniform-controls input, .uniform-controls select { min-width:0; min-height:42px; padding:8px 10px; }
    .uniform-list { min-height:0; overflow-y:auto; overscroll-behavior:contain; padding:0 22px 22px; }
    .uniform-row { display:grid; grid-template-columns:minmax(180px,1fr) minmax(160px,.7fr) minmax(180px,.9fr) minmax(180px,.9fr); gap:12px; align-items:center; padding:13px 0; border-bottom:1px solid var(--line); }
    .uniform-row:last-child { border-bottom:0; }
    .uniform-student b { display:block; }
    .uniform-student .meta { margin-top:4px; }
    .uniform-item { display:grid; gap:5px; }
    .uniform-item > b { font-size:12px; color:var(--muted); }
    .uniform-status { display:inline-flex; width:max-content; align-items:center; gap:6px; padding:5px 8px; border-radius:99px; font-size:12px; font-weight:800; }
    .uniform-status.received { background:#dcfae6; color:#087443; }
    .uniform-status.pending { background:#fee4e2; color:#b42318; }
    .uniform-edit { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .uniform-edit .check { min-height:34px; padding:6px 8px; border:1px solid var(--line); border-radius:7px; font-size:12px; }
    .uniform-edit input { min-width:0; min-height:34px; padding:6px 8px; font-size:12px; }
    .uniform-notes { grid-column:3 / -1; display:grid; grid-template-columns:110px 1fr auto; gap:7px; align-items:center; }
    .uniform-notes label { margin:0; font-size:12px; }
    .uniform-notes input { min-width:0; min-height:34px; padding:6px 8px; font-size:12px; }
    .uniform-save { min-height:34px; padding:6px 10px; font-size:12px; }
    .uniform-empty { padding:40px 15px; text-align:center; color:var(--muted); }
    @media (max-width:800px) {
      .side .nav #uniformNav { flex:1 1 0 !important; min-width:0; }
      .uniform-modal { padding:10px; align-items:center; }
      .uniform-dialog { width:100%; height:calc(100dvh - 20px); max-height:none; }
      .uniform-dialog .modal-head { padding:15px; }
      .uniform-summary { gap:7px; padding:10px 14px; }
      .uniform-summary div { padding:9px; }
      .uniform-summary span { font-size:10px; }
      .uniform-summary b { font-size:20px; }
      .uniform-controls { grid-template-columns:1fr; gap:7px; padding:12px 14px; }
      .uniform-list { padding:0 14px 14px; }
      .uniform-row { grid-template-columns:1fr; gap:9px; padding:13px 0; }
      .uniform-edit { grid-template-columns:1fr 1fr; }
      .uniform-notes { grid-column:auto; grid-template-columns:1fr auto; }
      .uniform-notes label { grid-column:1 / -1; }
      .uniform-notes input { grid-column:1 / -1; }
    }
  `;
  document.head.appendChild(style);

  const field = id => document.getElementById(id);
  const isAdmin = () => permission?.role === 'admin';
  const bool = value => value === true || value === 'true';
  const text = value => { const el = document.createElement('span'); el.textContent = value || ''; return el.innerHTML; };
  const dateValue = value => value ? String(value).slice(0, 10) : '';
  const status = (received, item) => `<span class="uniform-status ${received ? 'received' : 'pending'}">${received ? '✓ Recebeu' : `Pendente: ${item}`}</span>`;
  const allStudents = () => students.map(student => ({
    ...student,
    uniformReceived: bool(student.uniform_received),
    shoesReceived: bool(student.shoes_received),
    uniformSize: student.uniform_size || '',
    shoeSize: student.shoe_size || '',
    uniformReceivedAt: dateValue(student.uniform_received_at),
    uniformNotes: student.uniform_notes || ''
  }));

  function renderClassOptions() {
    const select = field('uniformClassFilter');
    const current = select.value;
    select.innerHTML = '<option value="">Todas as turmas</option>' + classes.map(item => `<option value="${item.id}">${text(item.name)}</option>`).join('');
    select.value = [...select.options].some(option => option.value === current) ? current : '';
  }

  function renderUniforms() {
    renderClassOptions();
    const classId = field('uniformClassFilter').value;
    const filter = field('uniformStatusFilter').value;
    const query = field('uniformSearch').value.trim().toLocaleLowerCase('pt-BR');
    const records = allStudents();
    field('uniformPendingCount').textContent = records.filter(item => !item.uniformReceived).length;
    field('shoesPendingCount').textContent = records.filter(item => !item.shoesReceived).length;
    field('bothPendingCount').textContent = records.filter(item => !item.uniformReceived && !item.shoesReceived).length;
    const visible = records.filter(item => {
      if (classId && item.classId !== classId) return false;
      if (query && !item.name.toLocaleLowerCase('pt-BR').includes(query)) return false;
      if (filter === 'pending-uniform') return !item.uniformReceived;
      if (filter === 'pending-shoes') return !item.shoesReceived;
      if (filter === 'pending-both') return !item.uniformReceived && !item.shoesReceived;
      if (filter === 'pending-any') return !item.uniformReceived || !item.shoesReceived;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity:'base' }));
    field('uniformList').innerHTML = visible.length ? visible.map(item => {
      const locked = !isAdmin();
      const disabled = locked ? 'disabled' : '';
      const title = `${text(item.name)}|${text(item.className)}`;
      return `<article class="uniform-row" data-student-id="${item.id}" data-student-title="${title}"><div class="uniform-student"><b>${text(item.name)}</b><div class="meta">Turma ${text(item.className)}</div></div><div class="uniform-item"><b>Uniforme</b>${status(item.uniformReceived, 'uniforme')}</div><div class="uniform-item"><b>Tênis</b>${status(item.shoesReceived, 'tênis')}</div>${isAdmin() ? `<div class="uniform-edit"><label class="check"><input class="uniform-received" type="checkbox" ${item.uniformReceived ? 'checked' : ''}> Uniforme entregue</label><label class="check"><input class="shoes-received" type="checkbox" ${item.shoesReceived ? 'checked' : ''}> Tênis entregue</label><input class="uniform-size" value="${text(item.uniformSize)}" maxlength="30" placeholder="Tam. uniforme" ${disabled}><input class="shoe-size" value="${text(item.shoeSize)}" maxlength="30" placeholder="Nº tênis" ${disabled}></div><div class="uniform-notes"><label>Data e observação</label><input class="uniform-date" type="date" value="${item.uniformReceivedAt}" ${disabled}><input class="uniform-note" value="${text(item.uniformNotes)}" maxlength="180" placeholder="Ex.: aguardando reposição" ${disabled}><button type="button" class="btn primary uniform-save" ${disabled}>Salvar</button></div>` : '<div class="meta">Somente o administrador pode registrar entregas.</div>'}</article>`;
    }).join('') : '<div class="uniform-empty">Nenhum aluno encontrado neste filtro.</div>';
  }

  async function refreshUniforms() {
    await load();
    renderUniforms();
  }

  uniformButton.onclick = async () => {
    modal.classList.remove('hidden');
    await refreshUniforms();
  };
  field('closeUniform').onclick = () => modal.classList.add('hidden');
  modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  ['uniformClassFilter', 'uniformStatusFilter'].forEach(id => field(id).onchange = renderUniforms);
  field('uniformSearch').oninput = renderUniforms;
  field('uniformList').onclick = async event => {
    const button = event.target.closest('.uniform-save');
    if (!button || !isAdmin()) return;
    const row = button.closest('.uniform-row');
    const id = row.dataset.studentId;
    const previous = students.find(item => item.id === id);
    if (!previous) return;
    const uniformReceived = row.querySelector('.uniform-received').checked;
    const shoesReceived = row.querySelector('.shoes-received').checked;
    const data = {
      uniform_received: uniformReceived,
      shoes_received: shoesReceived,
      uniform_size: row.querySelector('.uniform-size').value.trim() || null,
      shoe_size: row.querySelector('.shoe-size').value.trim() || null,
      uniform_received_at: row.querySelector('.uniform-date').value || null,
      uniform_notes: row.querySelector('.uniform-note').value.trim() || null
    };
    button.disabled = true;
    button.textContent = 'Salvando…';
    const { error } = await db.from('students').update(data).eq('id', id);
    if (error) {
      toast(error.message.includes('uniform_') ? 'Execute primeiro o script SQL do Uniforme no Supabase.' : error.message);
      button.disabled = false;
      button.textContent = 'Salvar';
      return;
    }
    toast('Registro de uniforme atualizado.');
    await refreshUniforms();
  };

  document.addEventListener('carometro:uniform-refresh', () => { if (!modal.classList.contains('hidden')) renderUniforms(); });
});
