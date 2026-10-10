(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.getElementById('familySchoolModal');
    if (!dialog || typeof db === 'undefined') return;
    const entryMount = document.getElementById('familyEntryMount');
    const cardsMount = document.getElementById('familyCardsMount');
    if (!entryMount || !cardsMount) return;
    const cardsArea = document.createElement('div');
    cardsArea.className = 'family-gate-area';
    cardsArea.innerHTML = `<section class="family-gate-panel" id="familyCardsPanel"><h4>Gerenciar carteirinhas</h4><p>Selecione a turma para imprimir todos os cartões ou escolha um aluno para imprimir somente o dele. Os dados vêm do cadastro do Carômetro.</p><div class="family-gate-row"><label for="familyCardClass">Turma<select id="familyCardClass"><option value="">Selecione a turma</option></select></label><button id="familyPrintCards" type="button" class="btn primary">Imprimir turma</button></div><div class="family-gate-row"><label for="familyReissueStudent">Aluno<select id="familyReissueStudent"><option value="">Selecione a turma acima</option></select></label><button id="familyPrintStudent" type="button" class="btn primary">Imprimir aluno</button><button id="familyReissueCard" type="button" class="btn secondary">Substituir carteirinha perdida</button></div><div class="family-digital-setting"><label><input id="familyEnableDigitalCards" type="checkbox"> Permitir carteirinha digital no Portal da Família</label><p>Somente responsáveis vinculados a alunos desta escola poderão abrir e compartilhar a carteirinha. A escola pode desativar o acesso e substituir um QR Code perdido.</p><p id="familyDigitalSettingStatus" role="status"></p></div><div class="family-digital-school-share"><h5>Compartilhar individualmente pela escola</h5><p>Selecione um aluno acima, prepare sua imagem e envie somente ao responsável autorizado. A escola escolhe o destinatário no celular; o Carômetro não envia a imagem automaticamente.</p><button id="familyPrepareDigitalStudent" type="button" class="btn secondary">Preparar imagem do aluno</button><img id="familyDigitalStudentPreview" class="hidden" alt="Frente e verso da carteirinha selecionada"><button id="familyShareDigitalStudent" type="button" class="btn primary hidden">Compartilhar imagem pronta</button><p id="familyDigitalShareStatus" role="status"></p></div><p id="familyCardsMessage" class="family-gate-message" role="status"></p></section>`;
    cardsMount.append(cardsArea);
    const entryArea = document.createElement('div');
    entryArea.className = 'family-gate-area';
    entryArea.innerHTML = `<section class="family-gate-panel" id="familyEntryPanel"><h4>Entrada dos alunos</h4><p>Leia o QR Code do verso da carteirinha e confira o aluno antes de registrar.</p><button id="familyStartScan" type="button" class="btn primary">Ler QR Code pela câmera</button> <button id="familyStopScan" type="button" class="btn secondary hidden">Parar câmera</button><div id="familyScanStage" class="family-scan-stage hidden"><video id="familyScanVideo" autoplay playsinline muted aria-label="Câmera para leitura da carteirinha"></video></div><p id="familyScanMessage" class="family-gate-message" role="status"></p><div id="familyScanStudent" class="family-scan-student hidden"></div><h5>Entradas recentes</h5><div id="familyRecentEntries" class="family-recent-entries"></div></section>`;
    entryMount.append(entryArea);
    const css = document.createElement('style');
    css.textContent = `.family-gate-area{display:grid;gap:20px;min-width:0}.family-gate-panel{border:1px solid #dce5f5;border-radius:14px;padding:18px;background:#f8faff;min-width:0}.family-gate-panel h4{margin:0 0 5px;font-size:17px}.family-gate-panel h5{margin:18px 0 8px}.family-gate-panel p{font-size:13px;color:#53627b;line-height:1.45}.family-gate-row{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:10px}.family-gate-row label{flex:1;min-width:180px}.family-gate-row select{margin-top:6px}.family-gate-message{min-height:18px;overflow-wrap:anywhere}.family-gate-message.error{color:#b42318}.family-digital-setting{margin-top:22px;padding:15px;border:1px solid #ccd9f2;border-radius:11px;background:#fff}.family-digital-setting label{display:flex!important;align-items:center;gap:10px;font-weight:750}.family-digital-setting input{width:19px!important;height:19px;min-height:0!important;margin:0!important;flex:none}.family-digital-setting p{margin:7px 0 0}.family-scan-stage{margin-top:14px;width:100%}.family-scan-stage video{display:block;width:100%;aspect-ratio:1/1;max-height:min(65dvh,640px);object-fit:cover;border-radius:12px;background:#17233a}.family-scan-student{display:flex;gap:14px;align-items:center;margin-top:14px;border:1px solid #ccd9f2;border-radius:12px;padding:14px;background:#fff;min-width:0;overflow-wrap:anywhere}.family-scan-student>div{flex:1;min-width:0}.family-scan-student img,.family-scan-student .family-photo-fallback{width:68px;height:80px;object-fit:cover;border-radius:8px;background:#e7edff;display:grid;place-items:center;font-weight:800;flex:none}.family-scan-student strong,.family-scan-student small{display:block}.family-scan-student small{margin:4px 0;color:#53627b}.family-scan-student .family-student-action{margin-top:9px;white-space:normal}.family-recent-entries{display:grid;gap:7px}.family-recent-entries>div{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border:1px solid #e1e7f2;border-radius:9px;padding:9px 11px;font-size:13px;overflow-wrap:anywhere}.family-recent-entries small{color:#65728a}.family-recent-entries button{border:1px solid #ccd9f2;border-radius:7px;background:#eef3ff;color:#29468a;padding:6px 9px;font-weight:700;cursor:pointer}@media(max-width:600px){.family-gate-panel{padding:12px}.family-gate-row{display:grid;grid-template-columns:1fr}.family-gate-row label{min-width:0}.family-gate-row .btn,#familyStartScan,#familyStopScan,.family-student-action{width:100%}.family-scan-stage{margin-inline:-6px;width:calc(100% + 12px)}.family-scan-student{align-items:flex-start}.family-recent-entries>div{align-items:flex-start;flex-direction:column}}`;
    css.textContent += `.family-digital-school-share{display:grid;justify-items:start;gap:9px;margin-top:15px;padding:15px;border:1px solid #ccd9f2;border-radius:11px;background:#fff}.family-digital-school-share h5,.family-digital-school-share p{margin:0}.family-digital-school-share img{display:block;width:min(100%,800px);height:auto;border:1px solid #dce5f5}.family-digital-school-share button{max-width:100%}@media(max-width:600px){.family-digital-school-share{padding:12px}.family-digital-school-share button{width:100%}}`;
    document.head.append(css);
    const get = id => document.getElementById(id);
    const escape = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
    const tokenPattern = /^CAROMETRO:CARD:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
    const formatTime = value => new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(value));
    let schoolId = null;
    let schoolName = '';
    let stream = null;
    let scanTimer = null;
    let scanGeneration = 0;
    let scanPaused = true;
    let nativeDetector = null;
    let nativeMisses = 0;
    let blockedToken = null;
    let blockedTokenMisses = 0;
    const scanCanvas = document.createElement('canvas');
    scanCanvas.width = 768;
    scanCanvas.height = 768;
    const scanContext = scanCanvas.getContext('2d', { willReadFrequently:true });
    let detectedToken = null;
    let currentStudent = null;
    let currentEntry = null;
    let identityVerified = false;
    let qrReaderPromise = null;
    function ensureQrReader() {
      if (typeof window.jsQR === 'function') return Promise.resolve();
      if (!qrReaderPromise) qrReaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'vendor/jsQR.js?v=1';
        script.onload = () => typeof window.jsQR === 'function' ? resolve() : reject(new Error('Leitor de QR indisponível.'));
        script.onerror = () => reject(new Error('Leitor de QR indisponível.'));
        document.head.append(script);
      }).catch(error => { qrReaderPromise = null; throw error; });
      return qrReaderPromise;
    }
    const setMessage = (id, message, isError = false) => {
      const node = get(id); node.textContent = message; node.classList.toggle('error', isError);
    };
    let preparedSchoolCard = null;
    function clearPreparedSchoolCard() {
      preparedSchoolCard = null;
      get('familyDigitalStudentPreview').removeAttribute('src');
      get('familyDigitalStudentPreview').classList.add('hidden');
      get('familyShareDigitalStudent').classList.add('hidden');
      setMessage('familyDigitalShareStatus','');
    }
    function pauseScan() {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = null;
      scanPaused = true;
    }
    function stopScan() {
      scanGeneration++;
      pauseScan();
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      nativeDetector = null;
      nativeMisses = 0;
      blockedToken = null;
      get('familyScanVideo').srcObject = null;
      get('familyScanStage').classList.add('hidden');
      get('familyStopScan').classList.add('hidden');
      get('familyStartScan').classList.remove('hidden');
      get('familyStartScan').disabled = false;
    }
    document.addEventListener('carometro:family-school-closed', stopScan);
    document.addEventListener('carometro:family-entry-hidden', stopScan);
    async function loadRecent() {
      if (!schoolId) return;
      const activeSchool = schoolId;
      const { data, error } = await db.rpc('family_recent_entries', { p_school_id:activeSchool, p_limit:20 });
      if (activeSchool !== schoolId) return;
      if (error) { get('familyRecentEntries').textContent = 'Não foi possível consultar as entradas.'; return; }
      get('familyRecentEntries').innerHTML = data?.length ? data.map(row => `<div><span><b>${escape(row.student_name)}</b> · ${escape(formatTime(row.arrived_at))}</span>${row.published_at ? '<small>Aviso no Portal da Família</small>' : `<button type="button" data-publish-entry="${escape(row.entry_id)}">Publicar aviso</button>`}</div>`).join('') : '<p>Nenhuma entrada registrada.</p>';
    }
    get('familyRecentEntries').onclick = event => {
      const button = event.target.closest('[data-publish-entry]');
      if (button) publishEntry(button.dataset.publishEntry, button);
    };
    document.addEventListener('carometro:family-school-opened', async event => {
      stopScan();
      schoolId = event.detail.schoolId;
      currentStudent = null; currentEntry = null; detectedToken = null;
      get('familyScanStudent').classList.add('hidden');
      setMessage('familyScanMessage','');
      await loadRecent();
    });
    document.addEventListener('carometro:family-cards-opened', async event => {
      schoolId = event.detail.schoolId;
      clearPreparedSchoolCard();
      setMessage('familyCardsMessage','');
      get('familyCardClass').innerHTML = '<option value="">Selecione a turma</option>';
      get('familyReissueStudent').innerHTML = '<option value="">Selecione a turma acima</option>';
      const activeSchool = schoolId;
      get('familyEnableDigitalCards').disabled = true;
      get('familyDigitalSettingStatus').textContent = 'Consultando liberação digital…';
      const [classesResult, schoolResult, digitalResult] = await Promise.all([
        db.from('classes').select('id,name').eq('school_id',activeSchool).is('archived_at',null).order('name'),
        db.from('schools').select('name').eq('id',activeSchool).maybeSingle(),
        db.rpc('family_digital_card_setting', { p_school_id:activeSchool }),
      ]);
      if (activeSchool !== schoolId) return;
      get('familyEnableDigitalCards').disabled = !!digitalResult.error;
      get('familyEnableDigitalCards').checked = digitalResult.data === true;
      get('familyDigitalSettingStatus').textContent = digitalResult.error ? 'Não foi possível consultar a liberação digital.' : digitalResult.data ? 'Carteirinha digital liberada nesta escola.' : 'Carteirinha digital desativada nesta escola.';
      if (classesResult.error || schoolResult.error) {
        setMessage('familyCardsMessage','Não foi possível carregar as turmas da escola.',true); return;
      }
      schoolName = schoolResult.data?.name || 'Escola';
      get('familyCardClass').innerHTML = '<option value="">Selecione a turma</option>' + (classesResult.data || []).map(row => `<option value="${row.id}">${escape(row.name)}</option>`).join('');
    });
    get('familyEnableDigitalCards').onchange = async event => {
      const checkbox = event.currentTarget;
      const activeSchool = schoolId;
      const enabled = checkbox.checked;
      checkbox.disabled = true;
      get('familyDigitalSettingStatus').textContent = 'Salvando…';
      const { data, error } = await db.rpc('family_digital_card_setting', { p_school_id:activeSchool,p_enabled:enabled });
      if (activeSchool !== schoolId) return;
      checkbox.disabled = false;
      if (error) checkbox.checked = !enabled;
      get('familyDigitalSettingStatus').textContent = error ? 'Não foi possível alterar a liberação. Tente novamente.' : data ? 'Carteirinha digital liberada para as famílias vinculadas.' : 'Carteirinha digital desativada nesta escola.';
    };
    get('familyCardClass').onchange = async () => {
      clearPreparedSchoolCard();
      const activeSchool = schoolId;
      const classId = get('familyCardClass').value;
      get('familyReissueStudent').innerHTML = '<option value="">Selecione um aluno</option>';
      if (!activeSchool || !classId) return;
      const { data, error } = await db.from('students').select('id,full_name')
        .eq('school_id',activeSchool).eq('class_id',classId).eq('enrollment_status','active').order('full_name');
      if (activeSchool !== schoolId || classId !== get('familyCardClass').value) return;
      if (error) return setMessage('familyCardsMessage','Não foi possível carregar os alunos da turma.',true);
      get('familyReissueStudent').innerHTML += (data || []).map(row => `<option value="${row.id}">${escape(row.full_name)}</option>`).join('');
    };
    get('familyReissueStudent').onchange = clearPreparedSchoolCard;
    get('familyReissueCard').onclick = async () => {
      const studentId = get('familyReissueStudent').value;
      if (!schoolId || !studentId) return setMessage('familyCardsMessage','Selecione a turma e o aluno.',true);
      const name = get('familyReissueStudent').selectedOptions[0]?.textContent || 'este aluno';
      if (!confirm(`Substituir a carteirinha de ${name}? O QR Code antigo deixará de funcionar imediatamente.`)) return;
      const button = get('familyReissueCard'); button.disabled = true;
      const activeSchool = schoolId;
      const { error } = await db.rpc('family_reissue_card', { p_school_id:activeSchool, p_student_id:studentId });
      button.disabled = false;
      if (activeSchool !== schoolId) return;
      if (!error) clearPreparedSchoolCard();
      setMessage('familyCardsMessage', error?.message || 'QR substituído. Clique em “Imprimir aluno” para imprimir a nova versão. O cartão antigo não funciona mais.',!!error);
    };
    get('familyPrepareDigitalStudent').onclick = async event => {
      const activeSchool = schoolId;
      const studentId = get('familyReissueStudent').value;
      if (!activeSchool || !studentId) return setMessage('familyDigitalShareStatus','Selecione a turma e o aluno.',true);
      clearPreparedSchoolCard();
      const button = event.currentTarget; button.disabled = true;
      setMessage('familyDigitalShareStatus','Preparando a imagem individual…');
      try {
        const { data, error } = await db.rpc('family_issue_card', { p_school_id:activeSchool,p_student_id:studentId });
        if (error || !data?.[0]) throw new Error(error?.message || 'Carteirinha não encontrada.');
        if (activeSchool !== schoolId || studentId !== get('familyReissueStudent').value) return;
        if (!window.FamilyDigitalCard || typeof window.qrcode !== 'function') throw new Error('Gerador da carteirinha indisponível.');
        const row = data[0];
        let photo = null;
        if (row.photo_path) {
          const result = await db.storage.from('student-photos').download(row.photo_path);
          if (result.error || !result.data) throw new Error('A foto do aluno não está disponível para compartilhar.');
          const url = URL.createObjectURL(result.data);
          try {
            photo = await new Promise((resolve,reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = () => reject(new Error('Não foi possível abrir a foto do aluno.'));
              image.src = url;
            });
          } finally { URL.revokeObjectURL(url); }
        }
        if (activeSchool !== schoolId || studentId !== get('familyReissueStudent').value) return;
        const canvas = window.FamilyDigitalCard.render({ ...row,school_name:schoolName },photo,window.qrcode);
        const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível gerar a imagem.')),'image/png'));
        if (activeSchool !== schoolId || studentId !== get('familyReissueStudent').value) return;
        const file = new File([blob],`carteirinha-${studentId}.png`,{type:'image/png'});
        preparedSchoolCard = {schoolId:activeSchool,studentId,file};
        get('familyDigitalStudentPreview').src = canvas.toDataURL('image/png');
        get('familyDigitalStudentPreview').classList.remove('hidden');
        get('familyShareDigitalStudent').classList.remove('hidden');
        setMessage('familyDigitalShareStatus','Imagem pronta. Confira o aluno e escolha o destinatário individualmente no aparelho.');
      } catch (caught) { setMessage('familyDigitalShareStatus',caught.message || 'Não foi possível preparar a imagem.',true); }
      finally { button.disabled = false; }
    };
    get('familyShareDigitalStudent').onclick = async event => {
      const prepared = preparedSchoolCard;
      if (!prepared || prepared.schoolId !== schoolId || prepared.studentId !== get('familyReissueStudent').value) return clearPreparedSchoolCard();
      const button = event.currentTarget; button.disabled = true;
      try {
        if (navigator.share && navigator.canShare?.({files:[prepared.file]})) {
          await navigator.share({ files:[prepared.file],title:'Carteirinha escolar' });
          setMessage('familyDigitalShareStatus','Compartilhamento concluído no aplicativo escolhido.');
        } else {
          const url = URL.createObjectURL(prepared.file);
          const anchor = document.createElement('a');
          anchor.href = url; anchor.download = prepared.file.name;
          document.body.append(anchor); anchor.click(); anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url),60000);
          setMessage('familyDigitalShareStatus','Imagem salva. Envie-a individualmente ao responsável autorizado.');
        }
      } catch (caught) { if (caught.name !== 'AbortError') setMessage('familyDigitalShareStatus',caught.message || 'Não foi possível compartilhar.',true); }
      finally { button.disabled = false; }
    };
    async function printCards(mode) {
      const classId = get('familyCardClass').value;
      const studentId = get('familyReissueStudent').value;
      if (!schoolId || !classId) return setMessage('familyCardsMessage','Selecione uma turma.',true);
      if (mode === 'student' && !studentId) return setMessage('familyCardsMessage','Selecione um aluno.',true);
      // Abrir a prévia durante o clique evita que o navegador bloqueie a janela após o RPC.
      const popup = window.open('', '_blank');
      if (!popup) return setMessage('familyCardsMessage','Permita a janela de impressão no navegador.',true);
      popup.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparando carteirinhas</title><style>body{font:16px system-ui,sans-serif;color:#17233a;background:#f5f7fb;margin:0;padding:32px}main{max-width:560px;margin:10vh auto;background:white;border:1px solid #dce5f5;border-radius:14px;padding:28px}h1{font-size:22px}p{line-height:1.5}</style><main><h1>Preparando impressão</h1><p id="familyPreparationStatus" role="status">Consultando a carteirinha...</p></main></html>');
      popup.document.close();
      const button = get(mode === 'student' ? 'familyPrintStudent' : 'familyPrintCards'); button.disabled = true;
      setMessage('familyCardsMessage',mode === 'student' ? 'Preparando a carteirinha do aluno...' : 'Gerando carteirinhas da turma...');
      const showProgress = message => {
        if (!popup.closed) {
          const status = popup.document.getElementById('familyPreparationStatus');
          if (status) status.textContent = message;
        }
        setMessage('familyCardsMessage',message);
      };
      const withTimeout = (promise, milliseconds, message) => new Promise((resolve,reject) => {
        const timer = setTimeout(() => reject(new Error(message)), milliseconds);
        Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, reason => { clearTimeout(timer); reject(reason); });
      });
      try {
        const activeSchool = schoolId;
        const { data, error } = await withTimeout(
          mode === 'student'
            ? db.rpc('family_issue_card', { p_school_id:activeSchool, p_student_id:studentId })
            : db.rpc('family_issue_cards', { p_school_id:activeSchool, p_class_id:classId }),
          60000, 'A consulta das carteirinhas demorou demais. Confira a conexão e tente novamente.'
        );
        if (error) throw error;
        if (activeSchool !== schoolId) throw new Error('A escola ativa mudou. Abra a tela novamente.');
        if (mode === 'student' && (classId !== get('familyCardClass').value || studentId !== get('familyReissueStudent').value)) throw new Error('A seleção mudou. Tente novamente.');
        if (!data?.length) throw new Error('Não há alunos ativos nesta turma.');
        if (typeof window.qrcode !== 'function' || !window.FamilyCardPrint) throw new Error('Gerador de carteirinhas indisponível.');
        showProgress(`Carregando fotos de ${data.length} aluno(s)...`);
        let missingPhotos = 0;
        const cards = await Promise.all(data.map(async row => {
          let photo_url = '';
          if (row.photo_path) {
            try {
              const result = await withTimeout(db.storage.from('student-photos').createSignedUrl(row.photo_path, 1800), 15000, 'Foto indisponível');
              photo_url = result.data?.signedUrl || '';
            } catch { /* A foto é opcional; a carteirinha continua com as iniciais. */ }
            if (!photo_url) missingPhotos++;
          }
          return { ...row, photo_url };
        }));
        const qrSvg = value => {
          const qr = window.qrcode(0,'M'); qr.addData(value); qr.make();
          return qr.createSvgTag({ cellSize:3, margin:4, scalable:true });
        };
        showProgress(`Montando ${cards.length} carteirinha(s) para impressão...`);
        await new Promise(resolve => setTimeout(resolve,0));
        const printHtml = window.FamilyCardPrint.render(cards, schoolName, qrSvg);
        if (popup.closed) throw new Error('A janela de impressão foi fechada. Abra novamente para imprimir.');
        popup.document.open();
        popup.document.write(printHtml);
        popup.document.close();
        setMessage('familyCardsMessage',`${cards.length} carteirinha(s) prontas${missingPhotos ? `; ${missingPhotos} foto(s) indisponível(is)` : ''}. Confira a prévia, imprima em uma face, recorte cada par e dobre ao meio.`);
      } catch (caught) {
        const message = caught.message || 'Não foi possível gerar as carteirinhas.';
        if (!popup.closed) {
          popup.document.open();
          popup.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Carteirinhas indisponíveis</title><body style="font:16px system-ui,sans-serif;color:#17233a;max-width:560px;margin:10vh auto;padding:24px"><h1>Não foi possível preparar as carteirinhas</h1><p id="familyPreparationError" role="alert"></p><p>Volte ao Carômetro e tente novamente.</p></body></html>');
          popup.document.close();
          popup.document.getElementById('familyPreparationError').textContent = message;
        }
        setMessage('familyCardsMessage',message,true);
      } finally { button.disabled = false; }
    }
    get('familyPrintCards').onclick = () => printCards('class');
    get('familyPrintStudent').onclick = () => printCards('student');
    async function displayStudent(rawValue) {
      const match = tokenPattern.exec(String(rawValue || '').trim());
      if (!match) {
        setMessage('familyScanMessage','Este QR Code não é uma carteirinha do Carômetro. Aponte para o próximo cartão.',true);
        setTimeout(resumeScan, 700);
        return;
      }
      detectedToken = match[1];
      currentStudent = null; currentEntry = null; identityVerified = false;
      get('familyScanStudent').classList.add('hidden');
      setMessage('familyScanMessage','Conferindo carteirinha...');
      const activeSchool = schoolId;
      const detectedGeneration = scanGeneration;
      const { data, error } = await db.rpc('family_lookup_card', { p_school_id:activeSchool, p_qr_token:detectedToken });
      if (activeSchool !== schoolId || detectedGeneration !== scanGeneration || !stream) return;
      if (error || !data?.[0]) {
        setMessage('familyScanMessage',error?.message || 'Carteirinha inválida para esta escola.',true);
        setTimeout(resumeScan, 900);
        return;
      }
      currentStudent = data[0];
      const selectedToken = detectedToken;
      get('familyScanStudent').innerHTML = `<span class="family-photo-fallback" aria-hidden="true">Aluno</span><div><strong>${escape(currentStudent.student_name)}</strong><small>Turma ${escape(currentStudent.class_name)} · Responsável: ${escape(currentStudent.guardian_name || 'não informado')}</small><button type="button" class="btn secondary family-student-action hidden" id="familyManualIdentity">Confirmei a identidade pessoalmente</button><button type="button" class="btn primary family-student-action" id="familyConfirmEntry" disabled>Confirmar entrada</button></div>`;
      get('familyScanStudent').classList.remove('hidden');
      get('familyConfirmEntry').disabled = true;
      setMessage('familyScanMessage',currentStudent.photo_path ? 'Carregando a foto atual do aluno para conferência…' : 'Foto não cadastrada. Confira a identidade do aluno pessoalmente.');
      get('familyConfirmEntry').onclick = confirmEntry;
      get('familyManualIdentity').onclick = () => {
        if (selectedToken !== detectedToken || activeSchool !== schoolId || detectedGeneration !== scanGeneration) return;
        identityVerified = true;
        get('familyConfirmEntry').disabled = false;
        get('familyManualIdentity').classList.add('hidden');
        setMessage('familyScanMessage','Identidade conferida pessoalmente. Confirme a entrada.');
      };
      get('familyScanStudent').scrollIntoView({ block:'nearest' });
      if (currentStudent.photo_path) {
        db.storage.from('student-photos').createSignedUrl(currentStudent.photo_path, 900).then(result => {
          if (selectedToken !== detectedToken || activeSchool !== schoolId || detectedGeneration !== scanGeneration) return;
          if (!result.data?.signedUrl) throw new Error('Foto indisponível');
          const photo = document.createElement('img');
          photo.alt = 'Foto do aluno';
          photo.onload = () => {
            if (selectedToken !== detectedToken || activeSchool !== schoolId || detectedGeneration !== scanGeneration) return;
            get('familyScanStudent').querySelector('.family-photo-fallback')?.replaceWith(photo);
            identityVerified = true;
            get('familyConfirmEntry').disabled = false;
            setMessage('familyScanMessage','Confira a foto e o nome atuais antes de confirmar a entrada.');
          };
          photo.onerror = () => {
            if (selectedToken !== detectedToken || activeSchool !== schoolId || detectedGeneration !== scanGeneration) return;
            get('familyManualIdentity').classList.remove('hidden');
            setMessage('familyScanMessage','Foto indisponível. Confira a identidade pessoalmente antes de registrar.',true);
          };
          photo.src = result.data.signedUrl;
        }).catch(() => {
          if (selectedToken !== detectedToken || activeSchool !== schoolId || detectedGeneration !== scanGeneration) return;
          get('familyManualIdentity').classList.remove('hidden');
          setMessage('familyScanMessage','Foto indisponível. Confira a identidade pessoalmente antes de registrar.',true);
        });
      } else get('familyManualIdentity').classList.remove('hidden');
    }
    async function confirmEntry() {
      if (!detectedToken || !currentStudent || !schoolId || !identityVerified) return;
      const button = get('familyConfirmEntry'); button.disabled = true;
      const activeSchool = schoolId;
      const { data, error } = await db.rpc('family_record_entry', { p_school_id:activeSchool, p_qr_token:detectedToken });
      if (activeSchool !== schoolId) return;
      if (error || !data?.[0]) { button.disabled = false; return setMessage('familyScanMessage',error?.message || 'Não foi possível registrar a entrada.',true); }
      currentEntry = data[0];
      setMessage('familyScanMessage',`${currentEntry.duplicate ? 'Entrada já registrada' : 'Entrada registrada'} às ${formatTime(currentEntry.arrived_at)}. Aponte a próxima carteirinha.`);
      button.textContent = 'Publicar aviso no Portal da Família';
      button.disabled = false;
      button.onclick = () => publishEntry(currentEntry.entry_id, button);
      blockedToken = detectedToken;
      blockedTokenMisses = 0;
      resumeScan();
      loadRecent();
    }
    async function publishEntry(entryId, button) {
      if (!entryId || !schoolId) return;
      button.disabled = true;
      const activeSchool = schoolId;
      const { error } = await db.rpc('family_publish_entry', { p_school_id:activeSchool, p_entry_id:entryId });
      if (activeSchool !== schoolId) return;
      if (error) { button.disabled = false; return setMessage('familyScanMessage',error.message || 'Não foi possível publicar o aviso.',true); }
      button.textContent = 'Aviso publicado';
      setMessage('familyScanMessage','O registro está disponível no Portal da Família dos responsáveis autorizados.');
      loadRecent();
    }
    function resumeScan() {
      if (!stream || dialog.classList.contains('hidden')) return;
      scanPaused = false;
      scanGeneration++;
      scanFrame(scanGeneration);
    }
    async function scanFrame(generation) {
      if (!stream || scanPaused || generation !== scanGeneration) return;
      if (dialog.classList.contains('hidden')) return stopScan();
      const video = get('familyScanVideo');
      let value = '';
      try {
        if (video.readyState >= 2 && video.videoWidth && video.videoHeight && scanContext) {
          const side = Math.min(video.videoWidth, video.videoHeight);
          scanContext.drawImage(video, (video.videoWidth-side)/2, (video.videoHeight-side)/2, side, side, 0, 0, 768, 768);
          if (nativeDetector) {
            try { value = (await nativeDetector.detect(scanCanvas))[0]?.rawValue || ''; }
            catch { nativeDetector = null; await ensureQrReader(); }
          }
          nativeMisses = value ? 0 : nativeMisses + 1;
          if (!value && typeof window.jsQR === 'function' && (!nativeDetector || nativeMisses % 3 === 0)) {
            const frame = scanContext.getImageData(0,0,768,768);
            value = window.jsQR(frame.data,768,768,{ inversionAttempts:'dontInvert' })?.data || '';
          }
        }
      } catch (caught) {
        setMessage('familyScanMessage',caught.message || 'Não foi possível ler a imagem da câmera.',true);
      }
      if (!stream || scanPaused || generation !== scanGeneration) return;
      if (value) {
        const token = tokenPattern.exec(String(value).trim())?.[1];
        if (token && token === blockedToken) blockedTokenMisses = 0;
        else {
          blockedToken = null;
          pauseScan();
          displayStudent(value);
          return;
        }
      } else if (blockedToken && ++blockedTokenMisses >= 8) blockedToken = null;
      scanTimer = setTimeout(() => scanFrame(generation), 90);
    }
    get('familyStartScan').onclick = async () => {
      if (!schoolId) return setMessage('familyScanMessage','Abra o Portal da Família e escolha uma escola.',true);
      if (!navigator.mediaDevices?.getUserMedia) return setMessage('familyScanMessage','Este navegador não disponibilizou a leitura por câmera. Atualize o navegador ou use outro dispositivo.',true);
      stopScan(); currentStudent = null; currentEntry = null; detectedToken = null;
      const requestGeneration = scanGeneration;
      get('familyScanStudent').classList.add('hidden');
      setMessage('familyScanMessage','Solicitando acesso à câmera...');
      try {
        nativeDetector = null;
        if (typeof window.BarcodeDetector === 'function') {
          try { nativeDetector = new window.BarcodeDetector({ formats:['qr_code'] }); } catch { /* O leitor jsQR atende aos demais aparelhos. */ }
        }
        if (nativeDetector) ensureQrReader().catch(() => {});
        else await ensureQrReader();
        if (requestGeneration !== scanGeneration || dialog.classList.contains('hidden') || get('familyEntryView').classList.contains('hidden')) return;
        const openedStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' }, width:{ ideal:1280 }, height:{ ideal:720 } }, audio:false });
        if (requestGeneration !== scanGeneration || dialog.classList.contains('hidden') || get('familyEntryView').classList.contains('hidden')) {
          openedStream.getTracks().forEach(track => track.stop());
          return;
        }
        stream = openedStream;
        const track = stream.getVideoTracks()[0];
        try {
          const zoom = track?.getCapabilities?.()?.zoom;
          if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max)) {
            const target = Math.min(zoom.max, Math.max(zoom.min, 1.5));
            if (target > (track.getSettings?.()?.zoom || 1)) {
              await track.applyConstraints({ advanced:[{ zoom:target }] });
            }
          }
        } catch { /* Alguns aparelhos não permitem zoom; a câmera continua funcionando. */ }
        const video = get('familyScanVideo'); video.srcObject = stream;
        await video.play();
        if (requestGeneration !== scanGeneration || stream !== openedStream || dialog.classList.contains('hidden') || get('familyEntryView').classList.contains('hidden')) {
          if (stream === openedStream) stopScan();
          return;
        }
        get('familyScanStage').classList.remove('hidden');
        get('familyStopScan').classList.remove('hidden');
        get('familyStartScan').classList.add('hidden');
        setMessage('familyScanMessage','Aponte a câmera para o QR Code da carteirinha.');
        get('familyScanStage').scrollIntoView({ block:'nearest' });
        resumeScan();
      } catch (caught) { stopScan(); setMessage('familyScanMessage',caught.message || 'Não foi possível abrir a câmera. Confira a permissão no navegador.',true); }
    };
    get('familyStopScan').onclick = stopScan;
  });
})();
