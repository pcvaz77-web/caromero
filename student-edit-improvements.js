document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('studentForm');
  const photoInput = document.getElementById('photoFile');
  photoInput.closest('.photo').querySelector('label').textContent = 'Foto do aluno';
  const fallbackObservations = [
    { value: '', label: 'Nenhum', standard: true },
    { value: 'Tem Laudo', label: 'Tem Laudo', standard: true },
    { value: 'Sem Laudo (Dificuldade Grave)', label: 'Sem Laudo (Dificuldade Grave)', standard: true },
    { value: 'Sem Laudo (Dificuldade Leve)', label: 'Sem Laudo (Dificuldade Leve)', standard: true },
    { value: 'Não alfabetizado', label: 'Não alfabetizado', standard: true }
  ];
  let observations = [...fallbackObservations];
  let observationOptionsLoaded = false;
  const normalizeObservation = value => {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeObservation(parsed[0]);
    } catch {}
    return ({
      'Laudo': 'Tem Laudo',
      'Dificuldade grave': 'Sem Laudo (Dificuldade Grave)',
      'Dificuldade leve': 'Sem Laudo (Dificuldade Leve)',
      'Sim': 'Tem Laudo',
      'Não': ''
    }[value] || value || '');
  };
  const hasRepresentativeObservation = value => {
    try { return Array.isArray(JSON.parse(value)) && JSON.parse(value).includes('Representante de turma'); }
    catch { return value === 'Representante de turma'; }
  };
  const decodeObservationValues = value => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(normalizeObservation).filter(Boolean);
    } catch {}
    return [normalizeObservation(value)].filter(Boolean);
  };
  const encodeObservationValues = values => values.length ? JSON.stringify(values) : '';
  const decodeObservations = value => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(normalizeObservation).filter(Boolean);
    } catch {}
    return [normalizeObservation(value)].filter(Boolean);
  };
  const configureObservationField = id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.closest('.field').querySelector('label').textContent = 'Observações do aluno';
    select.innerHTML = observations.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
  };
  configureObservationField('report');
  configureObservationField('bulkReport');
  const reportField = document.getElementById('report').closest('.field');
  const bulkReport = document.getElementById('bulkReport');
  const bulkReportField = bulkReport.closest('.field');
  const manageObservations = document.createElement('button');
  manageObservations.type = 'button';
  manageObservations.className = 'link manage-observations hidden';
  manageObservations.textContent = 'Gerenciar observações';
  reportField.appendChild(manageObservations);
  const observationManager = document.createElement('div');
  observationManager.className = 'photo-picker hidden';
  observationManager.innerHTML = '<form class="photo-picker-card observation-manager" id="observationManagerForm"><b>Gerenciar observações</b><span>Adicione opções que ficarão disponíveis para usuários autorizados.</span><input id="newObservation" maxlength="80" required placeholder="Ex.: Necessita acompanhamento"><button class="btn primary">Adicionar observação</button><div id="customObservationList" class="custom-observation-list"></div><button type="button" class="link" id="closeObservationManager">Fechar</button></form>';
  document.body.appendChild(observationManager);
  const escapeHtml = value => { const element = document.createElement('div'); element.textContent = value; return element.innerHTML; };
  const observationChoices = document.createElement('div');
  observationChoices.className = 'observation-choices';
  const clearObservations = document.createElement('button');
  clearObservations.type = 'button';
  clearObservations.className = 'link clear-observations hidden';
  clearObservations.textContent = 'Remover todas as observações';
  reportField.append(observationChoices, clearObservations);
  document.getElementById('report').classList.add('observation-select-hidden');
  const renderObservationChoices = (selected = []) => {
    const selectedValues = new Set(selected);
    observationChoices.innerHTML = observations.filter(option => option.value).map(option => `<label class="observation-choice"><input type="checkbox" value="${escapeHtml(option.value)}" ${selectedValues.has(option.value) ? 'checked' : ''}> <span>${escapeHtml(option.label)}</span></label>`).join('');
  };
  const selectedObservationValues = () => [...observationChoices.querySelectorAll('input:checked')].map(input => input.value);
  renderObservationChoices();
  const renderCustomObservations = () => {
    const managed = observations.filter(option => option.value && option.id);
    document.getElementById('customObservationList').innerHTML = managed.length
      ? `<b>Opções cadastradas</b>${managed.map(option => `<div class="custom-observation-item"><span>${escapeHtml(option.label)}</span><button type="button" class="delete-custom-observation" data-id="${option.id}">Excluir</button></div>`).join('')}`
      : '<div class="meta">Nenhuma observação cadastrada.</div>';
  };
  async function loadObservationOptions() {
    if (observationOptionsLoaded) return;
    const { data, error } = await db.from('observation_options').select('id,label').order('display_order').order('created_at');
    if (error) return;
    observations = [fallbackObservations[0], ...(data || []).map(item => ({ id: item.id, value: item.label, label: item.label, standard: false }))];
    observationOptionsLoaded = true;
    const selected = selectedObservationValues();
    configureObservationField('report');
    configureObservationField('bulkReport');
    renderObservationChoices(selected);
    renderCustomObservations();
  }
  const observationColorClass = text => ({
    'Tem Laudo': 'observation-report',
    'Sem Laudo (Dificuldade Grave)': 'observation-severe',
    'Sem Laudo (Dificuldade Leve)': 'observation-light',
    'Não alfabetizado': 'observation-literacy'
  }[text] || `observation-custom-${[...text].reduce((total, char) => total + char.codePointAt(0), 0) % 5}`);
  const paintObservation = pill => {
      const text = pill.textContent.trim();
      pill.classList.remove('observation-report', 'observation-severe', 'observation-light', 'observation-literacy', 'observation-custom-0', 'observation-custom-1', 'observation-custom-2', 'observation-custom-3', 'observation-custom-4');
      pill.classList.add(observationColorClass(text));
  };
  const applyObservationColors = () => {
    const representatives = [];
    document.querySelectorAll('#list .pill').forEach(pill => {
      const studentCard = pill.closest('.student');
      if (studentCard && hasRepresentativeObservation(pill.textContent.trim())) {
        representatives.push(studentCard);
        const meta = studentCard.querySelector(':scope > div:nth-child(2) .meta');
        if (meta) meta.innerHTML = '<span class="representative-label observation-custom-4">Representante de turma</span>';
      }
      pill.remove();
    });
    if (representatives.length) document.getElementById('list').prepend(...representatives);
    document.querySelectorAll('#studentDetails .pill').forEach(paintObservation);
  };
  new MutationObserver(applyObservationColors).observe(document.getElementById('list'), { childList: true, subtree: true });
  const formatDetailObservations = () => {
    document.querySelectorAll('#studentDetails .detail-row').forEach(row => {
      const heading = row.querySelector('b');
      if (!heading || heading.textContent.trim() !== 'Informação' || row.dataset.formatted) return;
      const raw = [...row.childNodes].filter(node => node !== heading).map(node => node.textContent).join('').trim();
      const values = decodeObservations(raw);
      [...row.childNodes].filter(node => node !== heading).forEach(node => node.remove());
      if (values.length) {
        const tags = document.createElement('div');
        tags.className = 'detail-observation-tags';
        values.forEach(value => { const tag = document.createElement('span'); tag.className = 'pill'; tag.textContent = value; paintObservation(tag); tags.appendChild(tag); });
        row.appendChild(tags);
      }
      row.dataset.formatted = 'true';
    });
  };
  new MutationObserver(formatDetailObservations).observe(document.getElementById('studentDetails'), { childList: true, subtree: true });
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
  const studentIdFromCard = card => card.getAttribute('onclick')?.match(/showStudentDetails\('([^']+)'\)/)?.[1];
  const setStudentPhoto = (studentId, url) => {
    document.querySelectorAll('#list .student').forEach(card => {
      if (studentIdFromCard(card) !== studentId) return;
      const avatar = card.querySelector('.avatar');
      if (avatar) avatar.innerHTML = `<img src="${url}" alt="">`;
    });
    if (detailStudentId === studentId) {
      const avatar = document.querySelector('#studentDetails .detail-head .avatar');
      if (avatar) avatar.innerHTML = `<img src="${url}" alt="">`;
    }
  };
  const loadStudentPhoto = async student => {
    if (!student?.photoPath || student.photoUrl || student.loadingPhoto) return;
    student.loadingPhoto = true;
    const { data } = await db.storage.from('student-photos').createSignedUrl(student.photoPath, 3600);
    student.loadingPhoto = false;
    if (!data?.signedUrl) return;
    student.photoUrl = data.signedUrl;
    setStudentPhoto(student.id, student.photoUrl);
  };
  let visiblePhotoObserver = null;
  const observeVisiblePhotos = () => {
    const cards = document.querySelectorAll('#list .student');
    if (!('IntersectionObserver' in window)) {
      cards.forEach(card => loadStudentPhoto(students.find(student => student.id === studentIdFromCard(card))));
      return;
    }
    if (visiblePhotoObserver) visiblePhotoObserver.disconnect();
    visiblePhotoObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      visiblePhotoObserver.unobserve(entry.target);
      loadStudentPhoto(students.find(student => student.id === studentIdFromCard(entry.target)));
    }), { rootMargin: '180px 0px' });
    cards.forEach(card => visiblePhotoObserver.observe(card));
  };
  new MutationObserver(observeVisiblePhotos).observe(document.getElementById('list'), { childList: true });
  window.load = async () => {
    const [studentsResult, classesResult] = await Promise.all([
      db.from('students').select('*').order('created_at', { ascending: false }),
      db.from('classes').select('*').order('name')
    ]);
    if (studentsResult.error || classesResult.error) { toast('Atualize o banco de dados com o novo script de turmas.'); return; }
    classes = classesResult.data || [];
    const classNames = new Map(classes.map(item => [item.id, item.name]));
    students = (studentsResult.data || []).map(item => ({
      id: item.id,
      name: item.full_name,
      classId: item.class_id,
      className: classNames.get(item.class_id) || item.class_name,
      report: item.has_report === 'Sim' ? 'Laudo' : item.has_report === 'Não' ? '' : item.has_report,
      photoPath: item.photo_path,
      photoUrl: ''
    }));
    render();
  };

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
    .pill.observation-report { background:#fef3c7; color:#92400e; }
    .pill.observation-severe { background:#fee4e2; color:#b42318; }
    .pill.observation-light { background:#ffead5; color:#b54708; }
    .pill.observation-literacy { background:#fce7f3; color:#9d174d; }
    .pill.observation-custom-0 { background:#ede9fe; color:#5b21b6; }
    .pill.observation-custom-1 { background:#dbeafe; color:#1d4ed8; }
    .pill.observation-custom-2 { background:#d1fae5; color:#047857; }
    .pill.observation-custom-3 { background:#ffe4e6; color:#be123c; }
    .pill.observation-custom-4 { background:#e0f2fe; color:#0369a1; }
    .representative-label { display:inline-flex; align-items:center; padding:4px 8px; border-radius:99px; font-size:12px; font-weight:750; }
    .representative-label.observation-custom-4 { background:#e0f2fe; color:#0369a1; }
    .detail-observation-tags { display:flex; flex-wrap:wrap; gap:8px; padding-top:3px; }
    .detail-observation-tags .pill { font-size:12px; padding:7px 10px; }
    .observation-select-hidden { display:none !important; }
    .observation-choices { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:8px; }
    .observation-choice { display:flex; align-items:center; gap:7px; margin:0; min-height:42px; padding:9px 10px; border:1px solid var(--line); border-radius:8px; font-size:13px; font-weight:650; cursor:pointer; }
    .observation-choice input { width:auto; min-height:0; }
    .clear-observations { margin-top:9px; color:var(--danger); }
    @media(max-width:800px) { .observation-choices { grid-template-columns:1fr; } }
    .manage-observations { margin-top:9px; }
    .observation-manager input { width:100%; }
    .custom-observation-list { display:grid; gap:6px; font-size:13px; color:var(--navy); }
    .custom-observation-list b { font-size:13px; }
    .custom-observation-item { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:7px; background:#f4f3ff; }
    .delete-custom-observation { padding:5px 7px; border-radius:6px; background:#fff; border:1px solid #fecdca; color:var(--danger); font-size:12px; font-weight:700; }
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

  async function openStudentForm(student) {
    if (!student && !classes.length) {
      toast('Cadastre uma turma antes de cadastrar alunos.');
      document.getElementById('classModal').classList.remove('hidden');
      return;
    }
    await loadObservationOptions();
    form.reset();
    pendingPhoto = null;
    removePhoto = false;
    document.getElementById('studentId').value = student?.id || '';
    document.getElementById('modalTitle').textContent = student ? 'Editar aluno' : 'Adicionar aluno';
    classSelect.innerHTML = classOptions(student?.classId || selectedClassId || '');
    document.getElementById('fullName').value = student?.name || '';
    const currentObservations = decodeObservationValues(student?.report);
    currentObservations.filter(value => !observations.some(option => option.value === value)).forEach(value => observations.push({ value, label: `${value} (opção removida)`, standard: true }));
    renderObservationChoices(currentObservations);
    refreshPhotoPreview(student);
    document.getElementById('fullName').disabled = !!student && !can('can_edit_name');
    const canEditObservations = can('can_edit_report');
    reportField.classList.toggle('hidden', !canEditObservations);
    observationChoices.querySelectorAll('input').forEach(input => { input.disabled = !canEditObservations; });
    clearObservations.classList.toggle('hidden', permission.role !== 'admin' || !student);
    manageObservations.classList.toggle('hidden', permission.role !== 'admin');
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
  document.getElementById('newBulk').addEventListener('click', async () => {
    await loadObservationOptions();
    const canEditObservations = can('can_edit_report');
    bulkReportField.classList.toggle('hidden', !canEditObservations);
    bulkReport.disabled = !canEditObservations;
    if (!canEditObservations) bulkReport.value = '';
  });
  manageObservations.onclick = async () => {
    await loadObservationOptions();
    renderCustomObservations();
    document.getElementById('newObservation').value = '';
    observationManager.classList.remove('hidden');
  };
  document.getElementById('closeObservationManager').onclick = () => observationManager.classList.add('hidden');
  observationManager.onclick = event => { if (event.target === observationManager) observationManager.classList.add('hidden'); };
  document.getElementById('observationManagerForm').onsubmit = async event => {
    event.preventDefault();
    const input = document.getElementById('newObservation');
    const label = input.value.trim().replace(/\s+/g, ' ');
    if (!label) return;
    if (observations.some(option => option.value.toLocaleLowerCase('pt-BR') === label.toLocaleLowerCase('pt-BR'))) {
      toast('Essa observação já existe.');
      return;
    }
    const { data, error } = await db.from('observation_options').insert({ label, display_order: observations.length }).select('id,label').single();
    if (error) { toast(error.code === '23505' ? 'Essa observação já existe.' : error.message); return; }
    observations.push({ id: data.id, value: data.label, label: data.label, standard: false });
    const selected = selectedObservationValues();
    configureObservationField('report');
    configureObservationField('bulkReport');
    renderObservationChoices(selected);
    renderCustomObservations();
    input.value = '';
    toast('Observação adicionada.');
  };
  document.getElementById('customObservationList').onclick = async event => {
    const button = event.target.closest('.delete-custom-observation');
    if (!button) return;
    const option = observations.find(item => item.id === button.dataset.id);
    if (!option || !confirm(`Excluir a observação “${option.label}”? Os alunos já cadastrados continuarão com esse registro até ele ser alterado.`)) return;
    const { error } = await db.from('observation_options').delete().eq('id', option.id);
    if (error) { toast(error.message); return; }
    observations = observations.filter(item => item.id !== option.id);
    const selected = selectedObservationValues().filter(value => value !== option.value);
    configureObservationField('report');
    configureObservationField('bulkReport');
    renderObservationChoices(selected);
    renderCustomObservations();
    toast('Observação excluída.');
  };
  clearObservations.onclick = () => {
    if (permission.role !== 'admin') return;
    observationChoices.querySelectorAll('input:checked').forEach(input => { input.checked = false; });
    toast('As observações serão removidas ao salvar o aluno.');
  };
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

    const observationValues = can('can_edit_report') ? selectedObservationValues() : decodeObservationValues(old?.report);
    const row = { full_name: document.getElementById('fullName').value.trim(), class_id: classId, class_name: cls.name, has_report: encodeObservationValues(observationValues), photo_path: photoPath };
    const result = id ? await db.from('students').update(row).eq('id', id) : await db.from('students').insert(row);
    if (result.error) { toast(result.error.message); return; }
    if ((pendingPhoto || removePhoto) && old?.photoPath) await db.storage.from('student-photos').remove([old.photoPath]);
    document.getElementById('studentModal').classList.add('hidden');
    toast('Dados salvos.');
    load();
  };
});
