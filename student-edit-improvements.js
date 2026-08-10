document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('studentForm');
  const photoInput = document.getElementById('photoFile');
  const preview = document.getElementById('preview');
  const classSelect = document.getElementById('classId');
  const classField = classSelect.closest('.field');
  const actions = form.querySelector('.actions');
  let pendingPhoto = null;
  let removePhoto = false;

  const controls = document.createElement('div');
  controls.className = 'photo-controls hidden';
  controls.innerHTML = '<button type="button" class="btn secondary" id="changePhoto">Alterar foto</button><button type="button" class="btn danger-outline" id="removePhoto">Excluir foto</button>';
  photoInput.closest('.photo').appendChild(controls);

  const moveField = document.createElement('div');
  moveField.className = 'field span move-class hidden';
  moveField.innerHTML = '<label class="check"><input type="checkbox" id="moveStudent"> Deseja mudar o aluno de turma?</label><div class="meta">Marque esta opção somente se o aluno for transferido.</div>';
  classField.before(moveField);

  const style = document.createElement('style');
  style.textContent = `
    .photo-controls { display:flex; gap:8px; margin-top:10px; }
    .danger-outline { color:var(--danger); background:#fff; border:1px solid #fecdca; }
    .move-class { padding:12px; border:1px solid var(--line); border-radius:9px; background:#f8faff; }
    .move-class .check { font-size:14px; }
  `;
  document.head.appendChild(style);

  function refreshPhotoPreview(student) {
    if (pendingPhoto) return;
    preview.innerHTML = student?.photoUrl ? `<img src="${student.photoUrl}" alt="">` : (student ? ini(student.name) : '👤');
  }

  function setClassVisibility() {
    const moving = document.getElementById('moveStudent').checked;
    classField.classList.toggle('hidden', !moving);
    classSelect.required = moving;
  }

  function openStudentForm(student) {
    if (!student && !classes.length) {
      toast('Cadastre uma turma antes de cadastrar alunos.');
      document.getElementById('classModal').classList.remove('hidden');
      return;
    }
    form.reset();
    pendingPhoto = null;
    removePhoto = false;
    document.getElementById('studentId').value = student?.id || '';
    document.getElementById('modalTitle').textContent = student ? 'Editar aluno' : 'Adicionar aluno';
    classSelect.innerHTML = classOptions(student?.classId || selectedClassId || '');
    document.getElementById('fullName').value = student?.name || '';
    document.getElementById('report').value = student?.report || '';
    refreshPhotoPreview(student);
    controls.classList.toggle('hidden', !student);
    moveField.classList.toggle('hidden', !student);
    classField.classList.toggle('hidden', !!student);
    classSelect.required = !student;
    document.getElementById('studentModal').classList.remove('hidden');
  }

  document.getElementById('moveStudent').onchange = setClassVisibility;
  document.getElementById('changePhoto').onclick = () => photoInput.click();
  document.getElementById('removePhoto').onclick = () => {
    pendingPhoto = null;
    photoInput.value = '';
    removePhoto = true;
    preview.textContent = '👤';
  };
  photoInput.onchange = event => {
    const image = event.target.files[0];
    if (!image) return;
    if (!image.type.startsWith('image/')) { toast('Escolha um arquivo de imagem.'); return; }
    pendingPhoto = image;
    removePhoto = false;
    const reader = new FileReader();
    reader.onload = () => { preview.innerHTML = `<img src="${reader.result}" alt="">`; };
    reader.readAsDataURL(image);
  };

  window.editStudent = id => openStudentForm(students.find(student => student.id === id));
  document.getElementById('newStudent').onclick = () => openStudentForm();

  form.onsubmit = async event => {
    event.preventDefault();
    const id = document.getElementById('studentId').value;
    const old = students.find(student => student.id === id);
    const isMoving = !old || document.getElementById('moveStudent').checked;
    const classId = isMoving ? classSelect.value : old.classId;
    const cls = classes.find(item => item.id === classId);
    if (!cls) { toast('Selecione uma turma.'); return; }

    let photoPath = old?.photoPath || null;
    if (removePhoto) photoPath = null;
    if (pendingPhoto) {
      const extension = (pendingPhoto.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '');
      photoPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await db.storage.from('student-photos').upload(photoPath, pendingPhoto, { contentType: pendingPhoto.type });
      if (error) { toast('Não foi possível enviar a foto.'); return; }
    }

    const row = { full_name: document.getElementById('fullName').value.trim(), class_id: classId, class_name: cls.name, has_report: document.getElementById('report').value, photo_path: photoPath };
    const result = id ? await db.from('students').update(row).eq('id', id) : await db.from('students').insert(row);
    if (result.error) { toast(result.error.message); return; }
    if ((pendingPhoto || removePhoto) && old?.photoPath) await db.storage.from('student-photos').remove([old.photoPath]);
    document.getElementById('studentModal').classList.add('hidden');
    toast('Dados salvos.');
    load();
  };
});
