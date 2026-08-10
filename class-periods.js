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
    .shift-tab { display:flex; align-items:center; justify-content:space-between; width:100%; padding:10px 12px; border-radius:8px; color:#c9d3e8; background:transparent; font-size:12px; font-weight:800; text-align:left; }
    .shift-tab:hover, .shift-tab[aria-expanded="true"] { color:#fff; background:#2b3c5d; }
    .shift-tab .arrow { font-size:14px; transition:transform .18s ease; }
    .shift-tab[aria-expanded="true"] .arrow { transform:rotate(180deg); }
    .shift-classes { padding:3px 0 2px 8px; }
    .shift-classes[hidden] { display:none; }
    .shift-empty { color:#8fa1c2; font-size:12px; padding:8px 12px; }
    .class-shift { margin-bottom:17px; }
    @media (max-width:800px) {
      .shift-group { margin:0; display:flex; }
      .shift-tab { width:auto; white-space:nowrap; padding:10px 12px; }
      .shift-tab .arrow { display:none; }
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
    classList.innerHTML = shifts.map(shift => {
      const items = classes.filter(item => (item.shift || 'Matutino') === shift);
      const isOpen = openShifts.has(shift);
      const buttons = items.length
        ? items.map(item => `<button class="class-list-button ${item.id === selected ? 'active' : ''}" data-class-id="${item.id}">${esc(item.name)}</button>`).join('')
        : '<div class="shift-empty">Nenhuma turma.</div>';
      return `<div class="shift-group"><button type="button" class="shift-tab" data-shift="${shift}" aria-expanded="${isOpen}">${shift}<span class="arrow">⌄</span></button><div class="shift-classes" ${isOpen ? '' : 'hidden'}>${buttons}</div></div>`;
    }).join('');
    classList.querySelectorAll('.shift-tab').forEach(button => {
      button.onclick = () => {
        const shift = button.dataset.shift;
        if (openShifts.has(shift)) openShifts.delete(shift); else openShifts.add(shift);
        drawGroups();
      };
    });
    classList.querySelectorAll('[data-class-id]').forEach(button => {
      button.onclick = () => window.selectClass(button.dataset.classId);
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

  classForm.onsubmit = async event => {
    event.preventDefault();
    const name = document.getElementById('newClassName').value.trim();
    const shift = document.getElementById('classShift').value;
    const { error } = await db.from('classes').insert({ name, shift });
    if (error) {
      toast(error.code === '23505' ? 'Essa turma já está cadastrada.' : error.message);
      return;
    }
    classModal.classList.add('hidden');
    toast('Turma cadastrada.');
    load();
  };

  document.getElementById('newClass').onclick = () => {
    classForm.reset();
    document.getElementById('classShift').value = 'Matutino';
    classModal.classList.remove('hidden');
  };
});
