document.addEventListener('DOMContentLoaded', () => {
  const shifts = ['Matutino', 'Vespertino', 'Noturno'];
  const openShifts = new Set();
  const classList = document.getElementById('classList');
  const classForm = document.getElementById('classForm');
  const classModal = document.getElementById('classModal');
  let drawing = false;
  let observer;

  const style = document.createElement('style');
  style.textContent = `
    .shift-group { margin: 5px 0 10px; }
    .shift-tab { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; padding:10px 12px; border-radius:8px; color:#c9d3e8; background:transparent; font-size:12px; font-weight:800; text-align:left; white-space:nowrap; overflow:hidden; }
    .shift-tab:hover, .shift-tab[aria-expanded="true"], .shift-tab.active { color:#fff; background:#2b3c5d; }
    .shift-tab-text { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; }
    .shift-tab-suffix { opacity:.65; font-weight:600; }
    .shift-tab .arrow { flex:none; font-size:14px; transition:transform .18s ease; }
    .shift-tab[aria-expanded="true"] .arrow { transform:rotate(180deg); }
    .shift-classes { padding:3px 0 2px 8px; }
    .shift-classes[hidden] { display:none; }
    .shift-empty { color:#8fa1c2; font-size:12px; padding:8px 12px; }
    .class-shift { margin-bottom:17px; }
    @media (max-width:800px) {
      .shift-group { margin:0; display:flex; }
      .shift-tab { width:auto; padding:10px 12px; }
      .shift-classes { position:fixed; z-index:6; left:10px; right:10px; bottom:74px; padding:8px; border-radius:12px; background:#17233a; box-shadow:0 12px 30px #0005; max-height:45vh; overflow:auto; }
      .shift-classes .class-list-button { display:block; width:100%; text-align:left; }
    }
  `;
  document.head.appendChild(style);

  function drawGroups() {
    if (drawing || !classList) return;
    drawing = true;
    observer?.disconnect();
    const selected = selectedClassId;
    const allStudentsButton = `<button type="button" class="shift-tab all-students-tab ${!selected && !selectedShift ? 'active' : ''}" data-all-students>Todos os alunos</button>`;
    classList.innerHTML = allStudentsButton + shifts.map(shift => {
      const items = classes.filter(item => (item.shift || 'Matutino') === shift);
      const isOpen = openShifts.has(shift);
      const buttons = items.length
        ? items.map(item => `<button class="class-list-button ${item.id === selected ? 'active' : ''}" data-class-id="${item.id}">${esc(item.name)}</button>`).join('')
        : '<div class="shift-empty">Nenhuma turma.</div>';
      // Um único botão: clicar nele seleciona o turno inteiro como escopo E
      // expande/recolhe a lista de turmas, na mesma ação — não existe mais
      // uma seta separada. "· Turmas" é só apresentação; data-select-shift
      // e a comparação de escopo continuam usando o valor real do turno
      // (shift), nunca esse texto.
      return `<div class="shift-group"><button type="button" class="shift-tab ${!selected && selectedShift === shift ? 'active' : ''}" data-select-shift="${shift}" aria-expanded="${isOpen}"><span class="shift-tab-text">${shift}<span class="shift-tab-suffix"> · Turmas</span></span><span class="arrow">⌄</span></button><div class="shift-classes" ${isOpen ? '' : 'hidden'}>${buttons}</div></div>`;
    }).join('');
    classList.querySelectorAll('[data-select-shift]').forEach(button => {
      button.onclick = () => {
        const shift = button.dataset.selectShift;
        selectedShift = shift;
        selectedClassId = null;
        detailStudentId = null;
        // Recolher a lista não cancela o turno selecionado, mas selecionar
        // (de novo ou pela primeira vez) sempre alterna a expansão daquele
        // mesmo turno — o mesmo clique faz as duas coisas juntas.
        const wasOpen = openShifts.has(shift);
        openShifts.clear();
        if (!wasOpen) openShifts.add(shift);
        window.render();
        drawGroups();
      };
    });
    classList.querySelector('[data-all-students]')?.addEventListener('click', () => {
      selectedClassId = null;
      selectedShift = null;
      detailStudentId = null;
      window.render();
      drawGroups();
    });
    classList.querySelectorAll('[data-class-id]').forEach(button => {
      button.onclick = () => {
        // No celular, feche o painel de turnos ao escolher uma turma para a
        // lista de alunos ficar visível imediatamente.
        if (window.matchMedia('(max-width: 800px)').matches) openShifts.clear();
        window.selectClass(button.dataset.classId);
        document.dispatchEvent(new CustomEvent('carometro:class-selected', {
          detail: { classId: button.dataset.classId }
        }));
        drawGroups();
      };
    });
    observer.observe(classList, { childList: true });
    drawing = false;
  }

  observer = new MutationObserver(drawGroups);
  drawGroups();

  // Cada novo acesso inicia com todos os turnos fechados, inclusive em uma
  // aba que permaneceu aberta após sair e entrar novamente.
  new MutationObserver(() => {
    if (!document.getElementById('app').classList.contains('hidden')) {
      openShifts.clear();
      drawGroups();
    }
  }).observe(document.getElementById('app'), { attributes:true, attributeFilter:['class'] });

  const shiftField = document.createElement('div');
  shiftField.className = 'field class-shift';
  shiftField.innerHTML = `<label for="classShift">Turno</label><select id="classShift" required>${shifts.map(shift => `<option value="${shift}">${shift}</option>`).join('')}</select>`;
  classForm.querySelector('.actions').before(shiftField);

  let classSaving = false;
  classForm.onsubmit = async event => {
    event.preventDefault();
    if (classSaving) return;
    const name = document.getElementById('newClassName').value.trim();
    const shift = document.getElementById('classShift').value;
    const normalizedName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
    const alreadyExists = classes.some(item => String(item.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR') === normalizedName && (item.shift || 'Matutino') === shift);
    if (alreadyExists) {
      toast(`A turma ${name} já está cadastrada no turno ${shift}.`);
      return;
    }
    const submit = classForm.querySelector('button[type="submit"]');
    classSaving = true;
    if (submit) { submit.disabled = true; submit.textContent = 'Cadastrando…'; }
    try {
      const schoolId = window.getActiveSchoolId?.() || null;
      if (!schoolId) { toast('Selecione uma escola antes de cadastrar a turma.'); return; }
      const row = { name, shift, school_id:schoolId };
      const { error } = await db.from('classes').insert(row);
      if (error) { toast(error.code === '23505' || error.message.includes('já está cadastrada') ? 'Essa turma já está cadastrada.' : error.message); return; }
      classModal.classList.add('hidden');
      toast('Turma cadastrada.');
      await load();
    } finally {
      classSaving = false;
      if (submit) { submit.disabled = false; submit.textContent = 'Cadastrar turma'; }
    }
  };

  document.getElementById('newClass').onclick = () => {
    classForm.reset();
    document.getElementById('classShift').value = 'Matutino';
    classModal.classList.remove('hidden');
  };
});
