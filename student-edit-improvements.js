document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('studentForm');
  const photoInput = document.getElementById('photoFile');
  const photoActions = document.createElement('div');
  photoActions.className = 'photo-source-actions';
  photoActions.innerHTML = '<button type="button" class="btn secondary" id="choosePhoto">Escolher da galeria</button><button type="button" class="btn secondary" id="takePhoto">Usar câmera</button>';
  const cameraInput = document.createElement('input');
  cameraInput.id = 'photoCamera';
  cameraInput.type = 'file';
  cameraInput.accept = 'image/*';
  cameraInput.capture = 'environment';
  cameraInput.className = 'photo-source-input';
  photoInput.before(photoActions);
  photoInput.after(cameraInput);
  const preview = document.getElementById('preview');
  const classSelect = document.getElementById('classId');
  const classField = classSelect.closest('.field');
  const actions = form.querySelector('.actions');
  let pendingPhoto = null;
  let removePhoto = false;
  const can = key => permission.role === 'admin' || permission.can_edit_all || permission[key];

  const controls = document.createElement('div');
  controls.className = 'photo-controls hidden';
  controls.innerHTML = '<button type="button" class="btn secondary" id="changePhoto">Editar foto</button><button type="button" class="btn danger-outline" id="removePhoto">Excluir foto</button>';
  photoInput.closest('.photo').appendChild(controls);

  const photoPicker = document.createElement('div');
  photoPicker.className = 'photo-picker hidden';
  photoPicker.innerHTML = '<div class="photo-picker-card"><b>Editar foto</b><span>Como deseja adicionar a nova foto?</span><button type="button" class="btn primary" id="pickerCamera">Usar câmera</button><button type="button" class="btn secondary" id="pickerGallery">Escolher da galeria</button><button type="button" class="link" id="closePhotoPicker">Cancelar</button></div>';
  document.body.appendChild(photoPicker);

  const moveField = document.createElement('div');
  moveField.className = 'field span move-class hidden';
  moveField.innerHTML = '<label class="check"><input type="checkbox" id="moveStudent"> Deseja mudar o aluno de turma?</label><div class="meta">Marque esta opção somente se o aluno for transferido.</div>';
  classField.before(moveField);

  const style = document.createElement('style');
  style.textContent = `
    .photo-controls { display:flex; gap:8px; margin-top:10px; }
    .photo-source-actions { display:flex; flex-wrap:wrap; gap:8px; }
    .photo-source-actions .btn, .photo-controls .btn { min-height:38px; padding:8px 11px; }
    #photoFile, .photo-source-input { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
    .photo-picker { position:fixed; inset:0; z-index:30 !important; display:grid; place-items:center; padding:20px; background:#10182880; }
    .photo-picker-card { width:min(330px,100%); display:grid; gap:10px; padding:22px; border-radius:14px; background:#fff; box-shadow:0 20px 45px #0003; }
    .photo-picker-card b { font-size:18px; }
    .photo-picker-card span { color:var(--muted); font-size:14px; margin-bottom:4px; }
    .photo-picker-card .link { justify-self:center; padding:7px; }
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
    const moving = can('can_edit_class') && document.getElementById('moveStudent').checked;
    classField.classList.toggle('hidden', !moving);
    classSelect.required = moving;
  }

  async function compressPhoto(source) {
    const imageUrl = URL.createObjectURL(source);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = imageUrl;
      });
      const limit = 800;
      const scale = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
      if (!blob) throw new Error('Não foi possível otimizar a foto.');
      return new File([blob], 'foto-aluno.jpg', { type: 'image/jpeg' });
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
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
    document.getElementById('fullName').disabled = !!student && !can('can_edit_name');
    document.getElementById('report').disabled = !!student && !can('can_edit_report');
    const photoDisabled = !!student && !can('can_edit_photo');
    photoInput.disabled = photoDisabled;
    cameraInput.disabled = photoDisabled;
    document.getElementById('choosePhoto').disabled = photoDisabled;
    document.getElementById('takePhoto').disabled = photoDisabled;
    photoActions.classList.toggle('hidden', !!student || photoDisabled);
    controls.classList.toggle('hidden', !student || !can('can_edit_photo'));
    moveField.classList.toggle('hidden', !student || !can('can_edit_class'));
    document.getElementById('moveStudent').checked = false;
    document.getElementById('moveStudent').disabled = !!student && !can('can_edit_class');
    classField.classList.toggle('hidden', !!student);
    classSelect.required = !student;
    document.getElementById('studentModal').classList.remove('hidden');
  }

  document.getElementById('moveStudent').onchange = setClassVisibility;
  document.getElementById('choosePhoto').onclick = () => photoInput.click();
  document.getElementById('takePhoto').onclick = () => cameraInput.click();
  document.getElementById('changePhoto').onclick = () => photoPicker.classList.remove('hidden');
  document.getElementById('pickerCamera').onclick = () => { photoPicker.classList.add('hidden'); cameraInput.click(); };
  document.getElementById('pickerGallery').onclick = () => { photoPicker.classList.add('hidden'); photoInput.click(); };
  document.getElementById('closePhotoPicker').onclick = () => photoPicker.classList.add('hidden');
  photoPicker.onclick = event => { if (event.target === photoPicker) photoPicker.classList.add('hidden'); };
  document.getElementById('removePhoto').onclick = () => {
    pendingPhoto = null;
    photoInput.value = '';
    cameraInput.value = '';
    removePhoto = true;
    preview.textContent = '👤';
  };
  async function preparePhoto(event) {
    const image = event.target.files[0];
    if (!image) return;
    if (!image.type.startsWith('image/')) { toast('Escolha um arquivo de imagem.'); return; }
    try {
      pendingPhoto = await compressPhoto(image);
      removePhoto = false;
      const reader = new FileReader();
      reader.onload = () => { preview.innerHTML = `<img src="${reader.result}" alt="">`; };
      reader.readAsDataURL(pendingPhoto);
      const reduction = Math.max(0, Math.round((1 - pendingPhoto.size / image.size) * 100));
      toast(reduction ? `Foto otimizada: ${reduction}% menor.` : 'Foto preparada para envio.');
    } catch {
      pendingPhoto = null;
      toast('Não foi possível otimizar esta foto. Tente outra imagem.');
    }
  }
  photoInput.onchange = preparePhoto;
  cameraInput.onchange = preparePhoto;

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
