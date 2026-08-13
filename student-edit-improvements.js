document.addEventListener('DOMContentLoaded', () => {
  const welcome = document.createElement('p');
  welcome.id = 'welcomeGreeting';
  welcome.className = 'welcome-greeting';
  const greetingForCurrentTime = () => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  };
  const formatGreeting = name => name ? `${greetingForCurrentTime()}, ${name}!` : `${greetingForCurrentTime()}!`;
  welcome.textContent = formatGreeting('');
  document.querySelector('.top > div').prepend(welcome);
  const showWelcomeGreeting = async () => {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) return;
    const { data: userProfile } = await db.from('profiles').select('full_name').eq('id', signedInUser.id).maybeSingle();
    const fullName = userProfile?.full_name?.trim() || signedInUser.user_metadata?.full_name?.trim() || signedInUser.email?.split('@')[0] || '';
    welcome.textContent = formatGreeting(fullName);
  };
  showWelcomeGreeting();
  document.addEventListener('carometro:profiles-changed', showWelcomeGreeting);
  new MutationObserver(() => {
    if (!document.getElementById('app').classList.contains('hidden')) showWelcomeGreeting();
  }).observe(document.getElementById('app'), { attributes:true, attributeFilter:['class'] });
  const legacySignOut = document.getElementById('signOut');
  legacySignOut.classList.add('hidden');
  const profileButton = document.createElement('button');
  profileButton.id = 'profileNav';
  profileButton.type = 'button';
  profileButton.innerHTML = '<span class="profile-nav-desktop">◉ &nbsp; Meu Perfil</span><span class="profile-nav-mobile"><span class="profile-nav-avatar"><span></span></span><span>Meu Perfil</span></span>';
  document.querySelector('.nav').appendChild(profileButton);
  const profileDrawer = document.createElement('aside');
  profileDrawer.id = 'profileDrawer';
  profileDrawer.className = 'profile-drawer';
  profileDrawer.innerHTML = `<div class="profile-drawer-head"><div><p class="eyebrow">Minha conta</p><h2>Meu Perfil</h2></div><button type="button" class="close" id="closeProfileDrawer" aria-label="Fechar">×</button></div><form id="profileForm" class="profile-form"><div class="profile-user"><div class="profile-user-mark" id="profileInitial">U</div><div><b id="profileCurrentName">Usuário</b><div class="meta" id="profileCurrentEmail"></div></div></div><div class="field"><label for="profileName">Nome</label><input id="profileName" autocomplete="name" required maxlength="100"></div><div class="field"><label for="profileEmail">E-mail</label><input id="profileEmail" type="email" autocomplete="email" required></div><div class="field"><label for="profilePassword">Nova senha</label><input id="profilePassword" type="password" autocomplete="new-password" minlength="6" placeholder="Deixe em branco para manter a atual"><div class="meta">Mínimo de 6 caracteres.</div></div><button class="btn primary full" type="submit">Salvar alterações</button></form><div class="profile-drawer-footer"><button type="button" class="btn danger-outline full" id="profileSignOut">Sair da conta</button></div>`;
  profileDrawer.querySelector('#profilePassword').closest('.field').insertAdjacentHTML('beforebegin', '<div class="field"><label for="profileCurrentPassword">Senha atual</label><input id="profileCurrentPassword" type="password" autocomplete="current-password" placeholder="Informe para trocar a senha"></div>');
  const profileBackdrop = document.createElement('div');
  profileBackdrop.id = 'profileBackdrop';
  profileBackdrop.className = 'profile-backdrop hidden';
  document.body.append(profileBackdrop, profileDrawer);
  const closeProfileDrawer = () => {
    profileDrawer.classList.remove('open');
    profileBackdrop.classList.add('hidden');
  };
  const openProfileDrawer = async () => {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) return;
    const { data: currentProfile } = await db.from('profiles').select('full_name,email').eq('id', signedInUser.id).maybeSingle();
    const fullName = currentProfile?.full_name?.trim() || signedInUser.user_metadata?.full_name?.trim() || signedInUser.email?.split('@')[0] || '';
    const currentEmail = signedInUser.email || currentProfile?.email || '';
    document.getElementById('profileName').value = fullName;
    document.getElementById('profileEmail').value = currentEmail;
    document.getElementById('profileCurrentPassword').value = '';
    document.getElementById('profilePassword').value = '';
    document.getElementById('profileCurrentName').textContent = fullName || 'Usuário';
    document.getElementById('profileCurrentEmail').textContent = currentEmail;
    document.getElementById('profileInitial').textContent = (fullName || currentEmail || 'U').trim().charAt(0).toUpperCase();
    profileBackdrop.classList.remove('hidden');
    profileDrawer.classList.add('open');
  };
  profileButton.onclick = openProfileDrawer;
  document.getElementById('closeProfileDrawer').onclick = closeProfileDrawer;
  profileBackdrop.onclick = closeProfileDrawer;
  legacySignOut.addEventListener('click', closeProfileDrawer);
  document.getElementById('profileSignOut').onclick = () => { closeProfileDrawer(); legacySignOut.click(); };
  document.getElementById('profileForm').onsubmit = async event => {
    event.preventDefault();
    const name = document.getElementById('profileName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const currentPassword = document.getElementById('profileCurrentPassword').value;
    const password = document.getElementById('profilePassword').value;
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser || !name || !email) return;
    const update = { data: { full_name: name } };
    if (email !== signedInUser.email) update.email = email;
    if (password) {
      if (!currentPassword) { toast('Informe sua senha atual para definir uma nova senha.'); return; }
      const { error: currentPasswordError } = await db.auth.signInWithPassword({ email: signedInUser.email, password: currentPassword });
      if (currentPasswordError) { toast('A senha atual informada não está correta.'); return; }
      update.password = password;
    }
    const { error } = await db.auth.updateUser(update);
    if (error) { toast(error.message); return; }
    const { error: profileError } = await db.from('profiles').upsert({ id: signedInUser.id, full_name: name, email: signedInUser.email }, { onConflict: 'id' });
    if (profileError) { toast(profileError.message); return; }
    welcome.textContent = formatGreeting(name);
    closeProfileDrawer();
    toast(email !== signedInUser.email ? 'Alterações salvas. Confirme o novo e-mail pela mensagem recebida.' : 'Alterações salvas.');
  };
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
  const syncLaudoCount = () => {
    document.getElementById('reports').textContent = students.filter(student => {
      try { return JSON.parse(student.report || '[]').includes('Tem Laudo'); }
      catch { return student.report === 'Tem Laudo' || student.report === 'Laudo'; }
    }).length;
  };
  new MutationObserver(syncLaudoCount).observe(document.getElementById('list'), { childList:true });
  const configureObservationField = id => {
    const select = document.getElementById(id);
    if (!select) return;
    select.closest('.field').querySelector('label').textContent = 'Observações do aluno';
    select.innerHTML = observations.map(option => `<option value="${option.value}">${option.label}</option>`).join('');
  };
  configureObservationField('report');
  configureObservationField('bulkReport');
  const reportField = document.getElementById('report').closest('.field');
  reportField.classList.add('student-observations-field');
  const bulkReport = document.getElementById('bulkReport');
  const bulkReportField = bulkReport.closest('.field');
  const manageObservations = document.createElement('button');
  manageObservations.type = 'button';
  manageObservations.className = 'link manage-observations hidden';
  manageObservations.textContent = 'Gerenciar observações';
  reportField.appendChild(manageObservations);
  const observationManager = document.createElement('div');
  observationManager.className = 'photo-picker observation-manager-overlay hidden';
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
  document.addEventListener('carometro:observations-changed', () => {
    observationOptionsLoaded = false;
    loadObservationOptions();
  });
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
  const ensureStudentEditActions = () => {
    document.querySelectorAll('#list .student').forEach(card => {
      const match = card.getAttribute('onclick')?.match(/showStudentDetails\('([^']+)'\)/);
      if (!match) return;
      const student = students.find(item => item.id === match[1]);
      const canEditStudent = permission.role === 'admin' || !!permission.can_edit_photo || (!!permission.is_coordinator && (permission.can_edit_all || permission.can_edit_photo || permission.can_edit_name || permission.can_edit_class || permission.can_edit_report));
      if (!canEditStudent) return;
      let actions = card.querySelector('.actions-small');
      if (!actions) {
        const placeholder = card.lastElementChild;
        actions = placeholder?.tagName === 'DIV' && !placeholder.textContent.trim() ? placeholder : document.createElement('div');
        actions.className = 'actions-small';
        if (!actions.parentElement) card.appendChild(actions);
      }
      if (actions.querySelector('.edit')) return;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'edit';
      edit.textContent = 'Editar';
      edit.onclick = event => { event.stopPropagation(); window.editStudent(match[1]); };
      actions.appendChild(edit);
    });
  };
  const applyObservationColors = () => {
    const representatives = [];
    document.querySelectorAll('#list .pill').forEach(pill => {
      const studentCard = pill.closest('.student');
      if (studentCard && hasRepresentativeObservation(pill.textContent.trim())) {
        representatives.push(studentCard);
        const meta = studentCard.querySelector(':scope > div:nth-child(2) .meta');
        if (meta) {
          // A marcação de representante ocupa o mesmo espaço abaixo do nome.
          // Preserve a etiqueta de Uniforme já calculada para que ela não
          // desapareça em alunos que possuem as duas informações.
          const uniformLabel = meta.querySelector('.uniform-card-label')?.cloneNode(true);
          meta.innerHTML = '<span class="representative-label observation-custom-4">Representante de turma</span>';
          if (uniformLabel) {
            meta.appendChild(document.createTextNode(' '));
            meta.appendChild(uniformLabel);
          }
        }
      }
      pill.remove();
    });
    if (representatives.length) document.getElementById('list').prepend(...representatives);
    ensureStudentEditActions();
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
  classField.classList.add('move-target-class');
  const actions = form.querySelector('.actions');
  let pendingPhoto = null;
  let removePhoto = false;
  let activeCounselorRights = null;
  const can = key => permission.role === 'admin' || (!!permission.is_coordinator && (permission.can_edit_all || permission[key])) || (key === 'can_edit_photo' && !!permission.can_edit_photo);
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
  let latestLoadRequest = 0;
  window.load = async () => {
    const requestId = ++latestLoadRequest;
    const [studentsResult, classesResult, uniformResult] = await Promise.all([
      db.from('students').select('*').order('created_at', { ascending: false }),
      db.from('classes').select('*').order('name'),
      // A lista principal precisa da mesma fonte de Uniforme que a janela de
      // controle usa. Não deixe as etiquetas dependerem de uma carga posterior.
      db.from('students').select('id,uniform_pending,uniform_received,shoes_received,material_received')
    ]);
    // Cadastros em lote disparam muitas atualizações ao mesmo tempo. Nunca
    // deixe uma resposta antiga substituir a lista mais recente na tela.
    if (requestId !== latestLoadRequest) return;
    if (studentsResult.error || classesResult.error) { toast('Atualize o banco de dados com o novo script de turmas.'); return; }
    classes = classesResult.data || [];
    const classNames = new Map(classes.map(item => [item.id, item.name]));
    const uniformStateById = new Map((uniformResult.data || []).map(item => [item.id, item]));
    window.uniformStateByStudent = uniformStateById;
    students = (studentsResult.data || []).map(item => ({
      id: item.id,
      name: item.full_name,
      classId: item.class_id,
      className: classNames.get(item.class_id) || item.class_name,
      report: item.has_report === 'Sim' ? 'Laudo' : item.has_report === 'Não' ? '' : item.has_report,
      photoPath: item.photo_path,
      uniform_received: uniformStateById.get(item.id)?.uniform_received ?? item.uniform_received,
      shoes_received: uniformStateById.get(item.id)?.shoes_received ?? item.shoes_received,
      material_received: uniformStateById.get(item.id)?.material_received ?? item.material_received,
      uniform_size: item.uniform_size,
      shoe_size: item.shoe_size,
      uniform_received_at: item.uniform_received_at,
      uniform_notes: item.uniform_notes,
      uniform_pending: uniformStateById.get(item.id)?.uniform_pending ?? item.uniform_pending,
      photoUrl: ''
    }));
    render();
    // Ponto único de sincronização: recursos adicionais devem ouvir este
    // evento, sem substituir window.load nem iniciar uma carga concorrente.
    document.dispatchEvent(new CustomEvent('carometro:data-loaded', { detail:{ requestId } }));
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
    .welcome-greeting { margin:0 0 8px; color:var(--blue); font-size:15px; font-weight:800; }
    .nav { display:flex; flex-direction:column; gap:8px; }
    #profileNav { margin:0; }
    .profile-nav-mobile { display:none; }
    .profile-backdrop { position:fixed; inset:0; z-index:39; background:#10182880; }
    .profile-drawer { position:fixed; z-index:40; top:0; right:0; width:min(420px,100%); height:100dvh; display:flex; flex-direction:column; background:#fff; box-shadow:-18px 0 44px #10182833; transform:translateX(105%); transition:transform .24s ease; }
    .profile-drawer.open { transform:translateX(0); }
    .profile-drawer-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:26px 24px 18px; border-bottom:1px solid var(--line); }
    .profile-drawer-head .eyebrow { margin:0 0 4px; }
    .profile-drawer-head h2 { margin:0; font-size:24px; }
    .profile-form { flex:1; overflow:auto; padding:22px 24px; }
    .profile-user { display:flex; align-items:center; gap:12px; padding:14px; margin-bottom:22px; border-radius:11px; background:#f4f7ff; }
    .profile-user-mark { width:42px; height:42px; display:grid; place-items:center; flex:none; border-radius:50%; background:#dce6ff; color:#315dbb; font-weight:850; }
    .profile-drawer-footer { padding:18px 24px 24px; border-top:1px solid var(--line); }
    #studentsNav, #permissionsNav, #profileNav { border:0; background:#2b3c5d; color:#fff; }
    #studentsNav:hover, #studentsNav:focus, #permissionsNav:hover, #permissionsNav:focus, #profileNav:hover, #profileNav:focus { background:#38527e; color:#fff; }
    @media(max-width:800px) {
      .side .nav { flex-direction:row; align-items:center; gap:8px; }
      .side .nav #studentsNav { flex:0 1 135px !important; min-width:0; }
      .side .nav #permissionsNav { flex:1 1 0 !important; min-width:0; }
      .side .nav #profileNav { flex:0 0 68px !important; min-height:58px; margin-left:auto; padding:4px 0 !important; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; }
      #profileNav .profile-nav-desktop { display:none; }
      #profileNav .profile-nav-mobile { display:flex; flex-direction:column; align-items:center; gap:3px; font-size:10px; line-height:1; font-weight:750; white-space:nowrap; }
      .profile-nav-avatar { width:29px; height:29px; position:relative; display:block; overflow:hidden; border-radius:50%; background:linear-gradient(145deg,#4ecdf1,#2f6fd7); }
      .profile-nav-avatar::before { content:''; position:absolute; top:5px; left:10px; width:9px; height:9px; border-radius:50%; background:#f6f8fc; }
      .profile-nav-avatar span { position:absolute; bottom:-5px; left:5px; width:19px; height:16px; border-radius:50% 50% 0 0; background:#f6f8fc; }
      .profile-drawer { width:min(390px,92vw); }
    }
    @media(max-width:340px) { .side .nav { gap:6px; } .side .nav #studentsNav { flex-basis:115px !important; } .side .nav #profileNav { flex-basis:62px !important; } }
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
    .observation-choices { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; max-height:38vh; margin-top:8px; padding-right:5px; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; -webkit-overflow-scrolling:touch; }
    .observation-choice { display:flex; align-items:center; gap:7px; margin:0; min-height:42px; padding:9px 10px; border:1px solid var(--line); border-radius:8px; font-size:13px; font-weight:650; cursor:pointer; }
    .observation-choice input { width:auto; min-height:0; }
    .clear-observations { margin-top:9px; color:var(--danger); }
    @media(max-width:800px) { .observation-choices { grid-template-columns:1fr; max-height:35dvh; } }
    .manage-observations { margin:5px 0 7px; padding:3px 0; text-align:left; }
    .observation-manager input { width:100%; }
    .custom-observation-list { display:grid; gap:6px; font-size:13px; color:var(--navy); }
    .custom-observation-list b { font-size:13px; }
    .custom-observation-item { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px; border-radius:7px; background:#f4f3ff; }
    .delete-custom-observation { padding:5px 7px; border-radius:6px; background:#fff; border:1px solid #fecdca; color:var(--danger); font-size:12px; font-weight:700; }
    .danger-outline { color:var(--danger); background:#fff; border:1px solid #fecdca; }
    .move-class { padding:12px; border:1px solid var(--line); border-radius:9px; background:#f8faff; }
    .move-class .check { font-size:14px; }
    /* As janelas permanecem fixas: a rolagem ocorre apenas nas listas de observações. */
    .observation-manager-overlay { position:fixed !important; inset:0 !important; z-index:200 !important; display:grid; place-items:center; height:100dvh; padding:20px; overflow:hidden; overscroll-behavior:none; touch-action:manipulation; }
    .observation-manager-overlay .photo-picker-card.observation-manager { width:min(560px, calc(100vw - 40px)); max-height:calc(100dvh - 40px); overflow:hidden; margin:0; }
    .observation-manager-overlay .custom-observation-list { max-height:45vh; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; -webkit-overflow-scrolling:touch; padding-right:5px; }
    #studentModal { overscroll-behavior:none; touch-action:manipulation; }
    #studentModal .modal { max-height:calc(100dvh - 24px); overflow:hidden; }
    #studentModal .observation-choices { overscroll-behavior:contain; touch-action:pan-y; }
    @media (min-width:801px) {
      /* Em computadores a janela também permanece fixa: somente as opções
         de observação usam a área de rolagem, sem esconder os botões finais. */
      #studentModal { padding:12px; align-items:center; }
      #studentModal .modal { width:min(720px, 100%); height:min(760px, calc(100dvh - 24px)); max-height:none; display:flex; flex-direction:column; }
      #studentModal .modal-head { flex:none; }
      #studentModal .form { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; padding-top:16px; padding-bottom:16px; }
      #studentModal .grid { flex:1; min-height:0; display:flex; flex-direction:column; gap:0; }
      #studentModal .student-observations-field { flex:1; min-height:0; display:flex; flex-direction:column; margin-bottom:0; }
      #studentModal .photo { margin-bottom:12px; }
      #studentModal .photo .preview { width:78px; height:78px; }
      #studentModal .photo .meta { display:none; }
      #studentModal .move-class { padding:9px 11px; }
      #studentModal .move-class .meta { display:none; }
      #studentModal .manage-observations { min-height:36px; margin:5px 0 7px; padding:7px 10px; }
      #studentModal .observation-choices { flex:1; min-height:min(150px, 25dvh); max-height:none; overflow-y:auto; padding-right:6px; }
      #studentModal .clear-observations { margin-top:6px; }
      #studentModal .actions { flex:none; }
      .photo-picker { padding:24px; }
      .photo-picker-card.observation-manager { width:min(560px, calc(100vw - 48px)); }
    }
    @media (max-width:800px) {
      .observation-manager-overlay { padding:12px; }
      .observation-manager-overlay .photo-picker-card.observation-manager { width:100%; max-height:calc(100dvh - 24px); margin:0; }
      .observation-manager-overlay .custom-observation-list { max-height:42dvh; }

      /* Formulário compacto: só a lista de observações rola. */
      #studentModal { padding:12px; align-items:center; }
      #studentModal .modal { width:100%; height:calc(100dvh - 24px); max-height:none; display:flex; flex-direction:column; }
      #studentModal .modal-head { flex:none; padding:15px 20px 13px; }
      #studentModal .modal-head h3 { font-size:19px; }
      #studentModal .form { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; padding:13px 20px 14px; }
      #studentModal .photo { display:grid; grid-template-columns:90px minmax(0,1fr); grid-template-areas:"preview info" "preview controls"; align-items:center; gap:5px 12px; margin-bottom:9px; }
      #studentModal .photo .preview { grid-area:preview; width:62px; height:62px; }
      #studentModal .photo > div:not(.preview):not(.photo-controls) { grid-area:info; }
      #studentModal .photo label { margin:0; font-size:13px; }
      #studentModal .photo .meta { display:none; }
      #studentModal .photo-controls { grid-area:controls; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); width:100%; min-width:0; gap:6px; margin:0; }
      #studentModal .photo-source-actions { gap:6px; margin:0; flex-wrap:nowrap; }
      #studentModal .photo-controls .btn, #studentModal .photo-source-actions .btn { width:100%; min-width:0; min-height:33px; padding:6px 5px; font-size:12px; white-space:nowrap; }
      #studentModal .grid { flex:1; min-height:0; display:flex; flex-direction:column; gap:0; }
      #studentModal .field { margin-bottom:8px; }
      #studentModal .field label { margin-bottom:4px; }
      #studentModal #fullName { min-height:42px; padding:9px 11px; }
      #studentModal .move-class { padding:9px 10px; }
      #studentModal .move-class .check { font-size:13px; }
      #studentModal .move-class .meta { margin-top:3px; font-size:12px; line-height:1.3; }
      #studentModal .student-observations-field { flex:1; min-height:0; display:flex; flex-direction:column; margin-bottom:0; }
      #studentModal .student-observations-field > label { font-size:16px; }
      #studentModal .manage-observations { min-height:0; margin:3px 0 5px; padding:2px 0; }
      #studentModal .observation-choices { flex:1; min-height:0; max-height:none; margin-top:0; padding-right:4px; }
      #studentModal .observation-choice { min-height:38px; padding:7px 9px; font-size:12px; }
      #studentModal .actions { flex:none; padding-top:9px; }
      #studentModal .actions .btn { min-height:39px; padding:8px 11px; }
    }
    /* Espaço de trabalho fixo: a janela não se move e a lista de observações
       recebe a altura disponível em qualquer computador, tablet ou celular. */
    #studentModal .photo .preview { width:clamp(72px, 12vw, 82px) !important; height:clamp(72px, 12vw, 82px) !important; }
    #studentModal .photo .meta, #studentModal .move-class .meta { display:none !important; }
    #studentModal .manage-observations { width:auto; min-height:0; margin:3px 0 5px; padding:2px 0; border:0; border-radius:0; background:transparent; }
    #studentModal .form, #studentModal .grid, #studentModal .student-observations-field { min-height:0 !important; overflow:hidden !important; }
    #studentModal .observation-choices { flex:1 1 auto !important; min-height:0 !important; max-height:none !important; overflow-y:auto !important; }
    #studentModal .actions { position:relative; z-index:2; flex:none; margin-top:8px; padding-top:8px; background:#fff; }
    #studentModal .move-class { min-height:36px; padding:5px 8px; }
    #studentModal .move-class .check { gap:6px; font-size:12px; }
    @media (min-width:801px) {
      /* Ao transferir, a turma escolhida ocupa a mesma linha da confirmação. */
      #studentModal .grid { display:grid !important; grid-template-columns:minmax(0, 1fr) 220px; align-content:start; gap:0 10px; }
      #studentModal .grid > .span, #studentModal .grid > .student-observations-field { grid-column:1 / -1; }
      #studentModal .move-class { grid-column:1; align-self:center; margin-bottom:6px; padding:5px 8px; }
      #studentModal .move-target-class { grid-column:2; align-self:center; margin:0 0 6px; }
      #studentModal .move-target-class.move-target-active label { display:none; }
      #studentModal .move-target-class.move-target-active select { min-height:38px; padding:7px 9px; }
    }
  `;
  document.head.appendChild(style);

  function refreshPhotoPreview(student) {
    if (pendingPhoto) return;
    preview.innerHTML = student?.photoUrl ? `<img src="${student.photoUrl}" alt="">` : (student ? ini(student.name) : '👤');
  }

  function setClassVisibility() {
    const moving = can('can_edit_class') && document.getElementById('moveStudent').checked;
    classField.classList.toggle('hidden', !moving);
    classField.classList.toggle('move-target-active', moving);
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
    activeCounselorRights = student ? window.counselorRightsForClass?.(student.classId) || null : null;
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
    moveField.classList.toggle('hidden', !student || !can('can_edit_class') || !!activeCounselorRights);
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
  let bulkSaving = false;
  document.getElementById('bulkForm').onsubmit = async event => {
    event.preventDefault();
    if (bulkSaving) return;
    const classId = document.getElementById('bulkClassId').value;
    const cls = classes.find(item => item.id === classId);
    const names = document.getElementById('bulkNames').value
      .split(/\r?\n|;/)
      .map(name => name.replace(/^[•·\-–]\s*/, '').trim())
      .filter(name => name.length >= 3);
    if (!cls) { toast('Selecione a turma que receberá os alunos.'); return; }
    if (!names.length) { toast('Cole ao menos um nome por linha.'); return; }
    if (names.length > 100) { toast('Cole até 100 nomes por vez.'); return; }

    const submit = document.querySelector('#bulkForm button[type="submit"]');
    bulkSaving = true;
    if (submit) { submit.disabled = true; submit.textContent = 'Salvando alunos…'; }
    try {
      const rows = names.map(fullName => ({
        full_name: fullName,
        class_id: classId,
        class_name: cls.name,
        has_report: bulkReport.disabled ? '' : bulkReport.value,
        photo_path: null
      }));
      const { data, error } = await db.from('students').insert(rows).select('id,class_id');
      if (error) { toast(error.message); return; }
      const saved = (data || []).filter(item => item.class_id === classId).length;
      if (saved !== rows.length) { toast('O cadastro não foi confirmado por completo. Nenhuma turma foi excluída. Tente novamente.'); return; }
      document.getElementById('bulkModal').classList.add('hidden');
      await load();
      toast(`${saved} aluno${saved === 1 ? '' : 's'} cadastrado${saved === 1 ? '' : 's'} na turma ${cls.name}.`);
    } finally {
      bulkSaving = false;
      if (submit) { submit.disabled = false; submit.textContent = 'Cadastrar alunos'; }
    }
  };
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
