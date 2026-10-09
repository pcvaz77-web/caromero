(function () {
  document.addEventListener('DOMContentLoaded', () => {
    const dialog = document.getElementById('familySchoolModal');
    if (!dialog || typeof db === 'undefined') return;
    const entryMount = document.getElementById('familyEntryMount');
    if (!entryMount) return;
    const area = document.createElement('div');
    area.className = 'family-gate-area';
    area.innerHTML = `<section class="family-gate-panel" id="familyCardsPanel"><h4>Carteirinhas dos alunos</h4><p>Selecione a turma. O Carômetro usará os nomes, fotos, turmas e contatos já cadastrados.</p><div class="family-gate-row"><label for="familyCardClass">Turma<select id="familyCardClass"><option value="">Selecione a turma</option></select></label><button id="familyPrintCards" type="button" class="btn primary">Gerar e imprimir carteirinhas</button></div><div class="family-gate-row"><label for="familyReissueStudent">Carteirinha perdida ou danificada<select id="familyReissueStudent"><option value="">Selecione a turma acima</option></select></label><button id="familyReissueCard" type="button" class="btn secondary">Substituir QR da carteirinha</button></div><p id="familyCardsMessage" class="family-gate-message" role="status"></p></section>
      <section class="family-gate-panel" id="familyEntryPanel"><h4>Entrada dos alunos</h4><p>Leia o QR Code do verso da carteirinha e confira o aluno antes de registrar.</p><button id="familyStartScan" type="button" class="btn primary">Ler QR Code pela câmera</button> <button id="familyStopScan" type="button" class="btn secondary hidden">Parar câmera</button><div id="familyScanStage" class="family-scan-stage hidden"><video id="familyScanVideo" autoplay playsinline muted aria-label="Câmera para leitura da carteirinha"></video><p>Aponte a câmera para o QR Code da carteirinha.</p></div><p id="familyScanMessage" class="family-gate-message" role="status"></p><div id="familyScanStudent" class="family-scan-student hidden"></div><h5>Entradas recentes</h5><div id="familyRecentEntries" class="family-recent-entries"></div></section>`;
    entryMount.append(area);
    const css = document.createElement('style');
    css.textContent = `.family-gate-area{display:grid;gap:20px;min-width:0}.family-gate-panel{border:1px solid #dce5f5;border-radius:14px;padding:18px;background:#f8faff;min-width:0}.family-gate-panel h4{margin:0 0 5px;font-size:17px}.family-gate-panel h5{margin:18px 0 8px}.family-gate-panel p{font-size:13px;color:#53627b;line-height:1.45}.family-gate-row{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:10px}.family-gate-row label{flex:1;min-width:180px}.family-gate-row select{margin-top:6px}.family-gate-message{min-height:18px;overflow-wrap:anywhere}.family-gate-message.error{color:#b42318}.family-scan-stage{margin-top:14px;max-width:460px}.family-scan-stage video{display:block;width:100%;aspect-ratio:4/3;max-height:min(55dvh,440px);object-fit:contain;border-radius:12px;background:#17233a}.family-scan-student{display:flex;gap:14px;align-items:center;margin-top:14px;border:1px solid #ccd9f2;border-radius:12px;padding:14px;background:#fff;min-width:0;overflow-wrap:anywhere}.family-scan-student>div{flex:1;min-width:0}.family-scan-student img,.family-scan-student .family-photo-fallback{width:68px;height:80px;object-fit:cover;border-radius:8px;background:#e7edff;display:grid;place-items:center;font-weight:800;flex:none}.family-scan-student strong,.family-scan-student small{display:block}.family-scan-student small{margin:4px 0;color:#53627b}.family-scan-student .family-student-action{margin-top:9px;white-space:normal}.family-recent-entries{display:grid;gap:7px}.family-recent-entries>div{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;border:1px solid #e1e7f2;border-radius:9px;padding:9px 11px;font-size:13px;overflow-wrap:anywhere}.family-recent-entries small{color:#65728a}@media(max-width:600px){.family-gate-panel{padding:15px}.family-gate-row{display:grid;grid-template-columns:1fr}.family-gate-row label{min-width:0}.family-gate-row .btn,#familyStartScan,#familyStopScan,.family-student-action{width:100%}.family-scan-student{align-items:flex-start}.family-recent-entries>div{align-items:flex-start;flex-direction:column}}`;
    document.head.append(css);
    const get = id => document.getElementById(id);
    const escape = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
    const tokenPattern = /^CAROMETRO:CARD:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
    const formatTime = value => new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(value));
    let schoolId = null;
    let schoolName = '';
    let stream = null;
    let scanTimer = null;
    let detectedToken = null;
    let currentStudent = null;
    let currentEntry = null;
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
    function stopScan() {
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = null;
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
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
      get('familyRecentEntries').innerHTML = data?.length ? data.map(row => `<div><span><b>${escape(row.student_name)}</b> · ${escape(formatTime(row.arrived_at))}</span><small>${row.published_at ? 'Aviso no Portal da Família' : 'Aguardando aviso'}</small></div>`).join('') : '<p>Nenhuma entrada registrada.</p>';
    }
    document.addEventListener('carometro:family-school-opened', async event => {
      stopScan();
      schoolId = event.detail.schoolId;
      currentStudent = null; currentEntry = null; detectedToken = null;
      get('familyScanStudent').classList.add('hidden');
      setMessage('familyCardsMessage',''); setMessage('familyScanMessage','');
      const activeSchool = schoolId;
      const [classesResult, schoolResult] = await Promise.all([
        db.from('classes').select('id,name').eq('school_id',activeSchool).is('archived_at',null).order('name'),
        db.from('schools').select('name').eq('id',activeSchool).maybeSingle(),
      ]);
      if (activeSchool !== schoolId) return;
      if (classesResult.error || schoolResult.error) {
        setMessage('familyCardsMessage','Não foi possível carregar as turmas da escola.',true); return;
      }
      schoolName = schoolResult.data?.name || 'Escola';
      get('familyCardClass').innerHTML = '<option value="">Selecione a turma</option>' + (classesResult.data || []).map(row => `<option value="${row.id}">${escape(row.name)}</option>`).join('');
      get('familyReissueStudent').innerHTML = '<option value="">Selecione a turma acima</option>';
      await loadRecent();
    });
    get('familyCardClass').onchange = async () => {
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
      setMessage('familyCardsMessage', error?.message || 'QR substituído. Clique em “Gerar e imprimir carteirinhas” para imprimir a nova versão.',!!error);
    };
    get('familyPrintCards').onclick = async () => {
      const classId = get('familyCardClass').value;
      if (!schoolId || !classId) return setMessage('familyCardsMessage','Selecione uma turma.',true);
      // Abrir a prévia durante o clique evita que o navegador bloqueie a janela após o RPC.
      const popup = window.open('', '_blank');
      if (!popup) return setMessage('familyCardsMessage','Permita a janela de impressão no navegador.',true);
      popup.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparando carteirinhas</title><style>body{font:16px system-ui,sans-serif;color:#17233a;background:#f5f7fb;margin:0;padding:32px}main{max-width:560px;margin:10vh auto;background:white;border:1px solid #dce5f5;border-radius:14px;padding:28px}h1{font-size:22px}p{line-height:1.5}</style><main><h1>Carteirinhas da turma</h1><p id="familyPreparationStatus" role="status">Consultando os alunos e as carteirinhas...</p></main></html>');
      popup.document.close();
      const button = get('familyPrintCards'); button.disabled = true;
      setMessage('familyCardsMessage','Gerando carteirinhas da turma...');
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
          db.rpc('family_issue_cards', { p_school_id:activeSchool, p_class_id:classId }),
          60000, 'A consulta das carteirinhas demorou demais. Confira a conexão e tente novamente.'
        );
        if (error) throw error;
        if (activeSchool !== schoolId) throw new Error('A escola ativa mudou. Abra a tela novamente.');
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
        setMessage('familyCardsMessage',`${cards.length} carteirinha(s) prontas${missingPhotos ? `; ${missingPhotos} foto(s) indisponível(is)` : ''}. Confira a prévia e imprima em frente e verso.`);
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
    };
    async function displayStudent(rawValue) {
      const match = tokenPattern.exec(String(rawValue || '').trim());
      if (!match) { setMessage('familyScanMessage','Este QR Code não é uma carteirinha do Carômetro.',true); return; }
      stopScan();
      detectedToken = match[1];
      currentStudent = null; currentEntry = null;
      get('familyScanStudent').classList.add('hidden');
      setMessage('familyScanMessage','Conferindo carteirinha...');
      const activeSchool = schoolId;
      const { data, error } = await db.rpc('family_lookup_card', { p_school_id:activeSchool, p_qr_token:detectedToken });
      if (activeSchool !== schoolId) return;
      if (error || !data?.[0]) return setMessage('familyScanMessage',error?.message || 'Carteirinha inválida para esta escola.',true);
      currentStudent = data[0];
      let photoUrl = '';
      if (currentStudent.photo_path) {
        const result = await db.storage.from('student-photos').createSignedUrl(currentStudent.photo_path, 900);
        photoUrl = result.data?.signedUrl || '';
      }
      get('familyScanStudent').innerHTML = `${photoUrl ? `<img src="${escape(photoUrl)}" alt="Foto do aluno">` : '<span class="family-photo-fallback" aria-hidden="true">Aluno</span>'}<div><strong>${escape(currentStudent.student_name)}</strong><small>Turma ${escape(currentStudent.class_name)} · Responsável: ${escape(currentStudent.guardian_name || 'não informado')}</small><button type="button" class="btn primary family-student-action" id="familyConfirmEntry">Confirmar entrada</button></div>`;
      get('familyScanStudent').classList.remove('hidden');
      setMessage('familyScanMessage','Confira a foto e o nome antes de registrar.');
      get('familyConfirmEntry').onclick = confirmEntry;
      get('familyScanStudent').scrollIntoView({ block:'nearest' });
    }
    async function confirmEntry() {
      if (!detectedToken || !currentStudent || !schoolId) return;
      const button = get('familyConfirmEntry'); button.disabled = true;
      const activeSchool = schoolId;
      const { data, error } = await db.rpc('family_record_entry', { p_school_id:activeSchool, p_qr_token:detectedToken });
      if (activeSchool !== schoolId) return;
      if (error || !data?.[0]) { button.disabled = false; return setMessage('familyScanMessage',error?.message || 'Não foi possível registrar a entrada.',true); }
      currentEntry = data[0];
      setMessage('familyScanMessage',`${currentEntry.duplicate ? 'Entrada já registrada' : 'Entrada registrada'} às ${formatTime(currentEntry.arrived_at)}.`);
      button.textContent = 'Publicar aviso no Portal da Família';
      button.disabled = false;
      button.onclick = publishEntry;
      await loadRecent();
    }
    async function publishEntry() {
      if (!currentEntry || !schoolId) return;
      const button = get('familyConfirmEntry'); button.disabled = true;
      const activeSchool = schoolId;
      const { error } = await db.rpc('family_publish_entry', { p_school_id:activeSchool, p_entry_id:currentEntry.entry_id });
      if (activeSchool !== schoolId) return;
      if (error) { button.disabled = false; return setMessage('familyScanMessage',error.message || 'Não foi possível publicar o aviso.',true); }
      button.textContent = 'Aviso publicado';
      setMessage('familyScanMessage','O registro está disponível no Portal da Família dos responsáveis autorizados.');
      await loadRecent();
    }
    async function scanFrame() {
      if (!stream || dialog.classList.contains('hidden')) return stopScan();
      const video = get('familyScanVideo');
      if (video.readyState >= 2 && typeof window.jsQR === 'function') {
        const canvas = document.createElement('canvas');
        const width = Math.min(video.videoWidth, 640);
        if (width > 0 && video.videoHeight > 0) {
          canvas.width = width; canvas.height = Math.round(width * video.videoHeight / video.videoWidth);
          const context = canvas.getContext('2d', { willReadFrequently:true });
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = context.getImageData(0,0,canvas.width,canvas.height);
          const found = window.jsQR(frame.data,frame.width,frame.height,{ inversionAttempts:'dontInvert' });
          if (found?.data) return displayStudent(found.data);
        }
      }
      scanTimer = setTimeout(scanFrame, 170);
    }
    get('familyStartScan').onclick = async () => {
      if (!schoolId) return setMessage('familyScanMessage','Abra o Portal da Família e escolha uma escola.',true);
      if (!navigator.mediaDevices?.getUserMedia) return setMessage('familyScanMessage','Este navegador não disponibilizou a leitura por câmera. Atualize o navegador ou use outro dispositivo.',true);
      stopScan(); currentStudent = null; currentEntry = null; detectedToken = null;
      get('familyScanStudent').classList.add('hidden');
      setMessage('familyScanMessage','Solicitando acesso à câmera...');
      try {
        await ensureQrReader();
        stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
        const video = get('familyScanVideo'); video.srcObject = stream;
        await video.play();
        get('familyScanStage').classList.remove('hidden');
        get('familyStopScan').classList.remove('hidden');
        get('familyStartScan').classList.add('hidden');
        setMessage('familyScanMessage','Aponte a câmera para o QR Code da carteirinha.');
        get('familyScanStage').scrollIntoView({ block:'nearest' });
        scanFrame();
      } catch (caught) { stopScan(); setMessage('familyScanMessage',caught.message || 'Não foi possível abrir a câmera. Confira a permissão no navegador.',true); }
    };
    get('familyStopScan').onclick = stopScan;
  });
})();
